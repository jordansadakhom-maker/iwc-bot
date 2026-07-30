"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Printer, Copy, History, Loader2, RefreshCw, Send, Check, ArrowLeft, CalendarClock, ListChecks, AlertTriangle } from "lucide-react";
import { Modal, inputCls } from "@/components/edit-ui";
import type { RapportImpayes, RapportHisto } from "@/lib/dispensaire-rapport-impayes";
import { RAPPORT_MODES, JOURS_SEMAINE, estModeAuto, type RapportConfig, type RapportMode } from "@/lib/dispensaire-rapport-const";
import { FILTRES_FDO, ageFactureJours, joursDeRetard, estOuverte, money, type Facture, type FiltreFDO } from "@/lib/dispensaire-facturation-const";
import { genererRapportImpayes, chargerSnapshotRapport, rafraichirRapport, setRapportConfig } from "@/app/dispensaire/factures/rapport-actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const ddMM = (iso: string | null) => { if (!iso) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
const jourLong = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long" }).format(new Date(iso)); } catch { return "—"; } };
const dtFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };

// Médecin signataire = tiré des effectifs. Titre affiché = son grade, sinon défaut.
type Medecin = { nom: string; grade: string | null };
const TITRE_DEFAUT = "Médecin du Dispensaire de Saint-Denis";
const titreDe = (grade: string | null | undefined) => (grade || "").trim() || TITRE_DEFAUT;

const INTRO = [
  "Conformément aux dispositions en vigueur, vous trouverez ci-joint la liste des personnes pour lesquelles une facture a été établie, à la suite de soins hospitaliers ou d'interventions en campagne.",
  "Les noms des intéressés ont été inscrits sur chaque facture, accompagnés du montant dû. Aucun contrôle d'identité n'a été effectué de manière contrainte.",
  "Les informations recueillies l'ont été soit sur déclaration verbale des patients, soit par consultation de leur pièce d'identité, avec leur consentement.",
];

function rapportTexte(r: RapportImpayes): string {
  const L: string[] = ["CABINET MÉDICAL DE SAINT-DENIS", "Rapport des impayés des soins, du Dispensaire et de l'Hôpital", "", ...INTRO, "Fait pour servir et valoir ce que de droit.", "", "ÉMISSION · NOM — $", ...r.impayes.map((i) => `${ddMM(i.date)} ${i.nom} — ${Math.round(i.montant)}`)];
  L.push("", "Personnes ayant payé depuis l'envoi du dernier document (émission · paiement) :");
  if (r.payes.length) L.push(...r.payes.map((p) => `• ${p.nom} — ${Math.round(p.montant)} (émis ${ddMM(p.emission)} · payé ${ddMM(p.date)})`)); else L.push("(aucun paiement depuis le dernier rapport)");
  L.push("", "Ci-dessus figure la liste des contrevenants.", "Veuillez agréer l'expression de nos salutations distinguées.", "", `Fait à Saint-Denis, le ${jourLong(r.genereLe)} de l'An de Grâce 1904`, `Dr. ${r.medecin} — ${r.medecinTitre}`);
  return L.join("\n");
}

// Impression PDF fiable : on ouvre une fenêtre dédiée avec un document AUTONOME
// (marges @page, aucune superposition, chaque ligne insécable). Remplace le
// window.print() « en place » qui, à cause du conteneur modal en overflow, faisait
// chevaucher les blocs sur la 2ᵉ page (correctif bug n°2).
function imprimerRapport(r: RapportImpayes) {
  const w = window.open("", "_blank", "width=900,height=1120");
  if (!w) return;
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  const impRows = r.impayes.length
    ? r.impayes.map((i) => `<tr><td>${esc(ddMM(i.date))} &nbsp; ${esc(i.nom)}</td><td class="r">${Math.round(i.montant)}</td></tr>`).join("")
    : `<tr><td colspan="2" class="vide">Aucun impayé à ce jour.</td></tr>`;
  const payRows = r.payes.length
    ? r.payes.map((p) => `<div class="pay">• ${esc(p.nom)} — <b>${Math.round(p.montant)}</b> <span class="muted">(émis ${esc(ddMM(p.emission))} · payé ${esc(ddMM(p.date))})</span></div>`).join("")
    : `<div class="muted i">Aucun paiement depuis le dernier rapport.</div>`;
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport des impayés — ${esc(jourLong(r.genereLe))}</title>
  <style>
    @page{margin:1.6cm}
    *{box-sizing:border-box}
    body{font-family:Georgia,'Times New Roman',serif;color:#2a2115;margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .doc{background:linear-gradient(180deg,#efe6cf,#e7dcc0);border:2px solid #b8a67e;box-shadow:inset 0 0 0 5px #efe6cf,inset 0 0 0 6px #cdb98d;padding:30px 34px}
    .center{text-align:center}
    h1{font-size:22px;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;margin:6px 0 2px}
    .k{font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.1em}
    .kk{font-size:11px;text-transform:uppercase;letter-spacing:.14em}
    .lat{font-size:11px;font-style:italic;color:#6a5c3f}
    .sep{margin:14px 0;text-align:center;color:#7a6a4a}
    .sep:before,.sep:after{content:"";display:inline-block;width:64px;height:1px;background:#b8a67e;vertical-align:middle;margin:0 8px}
    h2{font-size:17px;font-weight:bold;text-align:center;margin:6px 0}
    .intro p{font-size:13px;line-height:1.7;text-align:justify;margin:0 0 6px}
    table{width:100%;border-collapse:collapse;font-family:'Courier New',monospace;margin-top:4px}
    th{border-bottom:2px solid #8a7850;text-align:left;font-size:16px;padding:2px 0}
    th.r,td.r{text-align:right}
    td{border-bottom:1px solid #c7b68e66;font-size:14px;padding:3px 0;break-inside:avoid}
    td.vide{font-style:italic;color:#6a5c3f;border:0;padding-top:8px}
    .payes{margin-top:20px}
    .payes .u{font-size:13px;text-decoration:underline}
    .pay{font-family:'Courier New',monospace;font-size:14px;padding:2px 0;break-inside:avoid}
    .muted{color:#6a5c3f;font-size:12px}
    .i{font-style:italic}
    .concl p{font-size:13px;line-height:1.7;text-align:justify;margin:6px 0 0}
    .sign{margin-top:34px;text-align:right;break-inside:avoid}
    .sign .l{font-size:12px;color:#4a3b26}
    .sign .h{height:1px;background:#b8a67e;margin:6px 0;width:220px;margin-left:auto}
    .sign .nom{font-family:'Segoe Script','Brush Script MT',cursive;font-size:22px}
    .sign .dr{font-size:13px;font-weight:bold}
    .sign .ti{font-size:12px;font-style:italic}
    .foot{margin-top:22px;border-top:1px solid #b8a67e;padding-top:8px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#6a5c3f}
  </style></head><body><div class="doc">
    <div class="center">
      <div style="font-size:20px">⚕</div>
      <h1>Cabinet Médical de Saint-Denis</h1>
      <div class="k">Hôpital et Dispensaire de l'État de Louisiane</div>
      <div class="kk">Soigner — Soulager — Préserver</div>
      <div class="lat">« Sancte Lucas, ora pro nobis »</div>
    </div>
    <div class="sep"></div>
    <h2>Rapport des impayés des soins, du Dispensaire et de l'Hôpital</h2>
    <div class="sep"></div>
    <div class="intro">${INTRO.map((p) => `<p>${esc(p)}</p>`).join("")}<p>Fait pour servir et valoir ce que de droit.</p></div>
    <div class="sep"></div>
    <table><thead><tr><th>Date d'émission et Nom</th><th class="r">$</th></tr></thead><tbody>${impRows}</tbody></table>
    <div class="payes">
      <div class="u">Personnes ayant payé depuis l'envoi du dernier document :</div>
      <div class="muted">Nom — montant (date d'émission · date de paiement)</div>
      <div style="margin-top:4px">${payRows}</div>
    </div>
    <div class="concl">
      <p>Ci-dessus figure la liste des contrevenants.</p>
      <p>Pour toute information complémentaire, nous demeurons à votre entière disposition.</p>
      <p>Veuillez agréer l'expression de nos salutations distinguées.</p>
    </div>
    <div class="sign">
      <div class="l">Fait à Saint-Denis, le ${esc(jourLong(r.genereLe))} de l'An de Grâce 1904</div>
      <div class="l">Pour le Cabinet Médical de Saint-Denis,</div>
      <div class="h"></div>
      <div class="nom">${esc(r.medecin)}</div>
      <div class="dr">Dr. ${esc(r.medecin)}</div>
      <div class="ti">${esc(r.medecinTitre || TITRE_DEFAUT)}</div>
    </div>
    <div class="foot">Ars Medicina · Humanitas · Scientia — Primum non nocere</div>
  </div><script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

const Sep = () => <div className="my-3 flex items-center justify-center gap-2 text-[#7a6a4a]"><span className="h-px w-16 bg-[#b8a67e]" /><span className="text-[0.7rem]">❖</span><span className="h-px w-16 bg-[#b8a67e]" /></div>;

function Stamp({ tone, l1, l2 }: { tone: string; l1: string; l2: string }) {
  return (
    <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full text-center" style={{ border: `2px solid ${tone}`, color: tone, transform: "rotate(-8deg)", boxShadow: `inset 0 0 0 3px ${tone}22` }}>
      <div className="px-1">
        <div className="text-[1rem] leading-none">⚕</div>
        <div className="mt-0.5 text-[0.42rem] font-bold uppercase leading-tight tracking-[0.06em]">{l1}</div>
        <div className="text-[0.42rem] uppercase leading-tight">{l2}</div>
      </div>
    </div>
  );
}

// Document fidèle au modèle officiel (parchemin, imprimable).
export function RapportDoc({ rapport: r }: { rapport: RapportImpayes }) {
  return (
    <div className="rapport-doc" style={{ background: "linear-gradient(180deg,#efe6cf,#e7dcc0)", color: "#2a2115", border: "2px solid #b8a67e", boxShadow: "inset 0 0 0 5px #efe6cf, inset 0 0 0 6px #cdb98d", padding: "26px 30px", fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <div className="text-center">
        <div className="text-[1.3rem]">⚕</div>
        <h1 className="mt-1 text-[1.5rem] font-bold uppercase tracking-[0.06em]" style={{ fontFamily: "Georgia, serif" }}>Cabinet Médical de Saint-Denis</h1>
        <div className="text-[0.74rem] font-semibold uppercase tracking-[0.1em]">Hôpital et Dispensaire de l'État de Louisiane</div>
        <div className="text-[0.72rem] uppercase tracking-[0.14em]">Soigner — Soulager — Préserver</div>
        <div className="text-[0.72rem] italic text-[#6a5c3f]">« Sancte Lucas, ora pro nobis »</div>
      </div>
      <Sep />
      <h2 className="text-center text-[1.15rem] font-bold" style={{ fontFamily: "Georgia, serif" }}>Rapport des impayés des soins, du Dispensaire et de l&apos;Hôpital</h2>
      <Sep />
      <div className="space-y-1.5 text-[0.82rem] leading-relaxed" style={{ textAlign: "justify" }}>
        {INTRO.map((p, i) => <p key={i}>{p}</p>)}
        <p>Fait pour servir et valoir ce que de droit.</p>
      </div>
      <Sep />

      {/* Tableau des impayés */}
      <div style={{ fontFamily: "'Courier New', monospace" }}>
        <div className="flex items-end justify-between border-b-2 border-[#8a7850] pb-1">
          <span className="text-[1.15rem] font-bold">Date et Nom</span><span className="text-[1.15rem] font-bold">$</span>
        </div>
        {r.impayes.length ? r.impayes.map((i, k) => (
          <div key={k} className="flex items-baseline justify-between border-b py-0.5 text-[0.9rem]" style={{ borderColor: "#c7b68e66" }}>
            <span>{ddMM(i.date)} {i.nom}</span><span className="font-bold">{Math.round(i.montant)}</span>
          </div>
        )) : <p className="py-2 text-[0.85rem] italic text-[#6a5c3f]">Aucun impayé à ce jour.</p>}
      </div>

      {/* Paiements depuis le dernier rapport */}
      <div className="mt-5">
        <p className="text-[0.82rem] underline">Voici la liste des personnes qui ont payé depuis l&apos;envoi du dernier document :</p>
        <p className="text-[0.78rem]">Nom — montant (date d&apos;émission · date de paiement)</p>
        <div className="mt-1" style={{ fontFamily: "'Courier New', monospace" }}>
          {r.payes.length ? r.payes.map((p, k) => <div key={k} className="text-[0.86rem]">• {p.nom} — {Math.round(p.montant)} <span className="text-[0.72rem] text-[#6a5c3f]">(émis {ddMM(p.emission)} · payé {ddMM(p.date)})</span></div>) : <p className="text-[0.82rem] italic text-[#6a5c3f]">Aucun paiement depuis le dernier rapport.</p>}
        </div>
      </div>

      <div className="mt-5 space-y-1 text-[0.82rem] leading-relaxed" style={{ textAlign: "justify" }}>
        <p>Ci-dessus figure la liste des contrevenants.</p>
        <p>Pour toute information complémentaire, nous demeurons à votre entière disposition afin de vous fournir l&apos;ensemble des précisions nécessaires.</p>
        <p>Veuillez agréer l&apos;expression de nos salutations distinguées.</p>
      </div>

      {/* Signatures & tampons */}
      <div className="mt-6 flex items-end justify-between gap-3">
        <Stamp tone="#8a2f2a" l1="Cabinet Médical" l2="Saint-Denis" />
        <div className="text-center text-[0.8rem]">
          <div>Fait à Saint-Denis,</div>
          <div>le {jourLong(r.genereLe)} de l&apos;An de Grâce 1904</div>
          <div className="my-1 h-px bg-[#b8a67e]" />
          <div className="text-[0.76rem]">Pour le Cabinet Médical de Saint-Denis,</div>
          <div className="mt-1 text-[1.3rem]" style={{ fontFamily: "'Segoe Script','Brush Script MT',cursive" }}>{r.medecin || "……"}</div>
          <div className="text-[0.78rem] font-semibold">Dr. {r.medecin || "……"}</div>
          <div className="text-[0.72rem] italic">{r.medecinTitre || TITRE_DEFAUT}</div>
        </div>
        <Stamp tone="#3a3222" l1="State Medical Board" l2="1904" />
      </div>
      <div className="mt-4 border-t border-[#b8a67e] pt-2 text-center text-[0.68rem] uppercase tracking-[0.08em] text-[#6a5c3f]">
        Ars Medicina · Humanitas · Scientia — Primum non nocere
      </div>
    </div>
  );
}

export function RapportImpayesModal({ initial, historique, config, medecins = [], factures = [], onClose }: { initial: RapportImpayes; historique: RapportHisto[]; config: RapportConfig; medecins?: Medecin[]; factures?: Facture[]; onClose: () => void }) {
  const router = useRouter();
  const [doc, setDoc] = useState<RapportImpayes>(initial);

  // Change le médecin signataire (nom + titre/grade) → l'aperçu, l'impression et
  // le texte copié s'adaptent aussitôt. Aucune requête : simple mise à jour locale.
  function choisirMedecin(nom: string) {
    const m = medecins.find((x) => x.nom === nom);
    setDoc((d) => ({ ...d, medecin: nom || d.medecin, medecinTitre: titreDe(m?.grade) }));
  }
  const [histo, setHisto] = useState<RapportHisto[]>(historique);
  const [vue, setVue] = useState<"selection" | "apercu" | "histo" | "plan">("selection");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [cfg, setCfg] = useState<RapportConfig>(config);

  // ── Sélection des factures à déclarer ──────────────────────────────────────
  const seuil = Math.max(0, cfg.joursRetard);                              // délai de retard (jours)
  const [filtre, setFiltre] = useState<FiltreFDO>("retard");
  const [joursN, setJoursN] = useState<number>(seuil);                     // seuil ad-hoc pour le filtre « Dépassant N jours »
  // Factures candidates = uniquement les NON réglées (seules déclarables).
  const candidats = useMemo(() => {
    const now = Date.now();
    return factures
      .filter((f) => estOuverte(f.statuts))
      .map((f) => ({ f, age: ageFactureJours(f, now), retard: joursDeRetard(f, seuil, now) }))
      .sort((a, b) => b.age - a.age);
  }, [factures, seuil]);
  // Préselection selon le filtre choisi.
  const preselection = (fi: FiltreFDO, n: number): Set<string> => {
    const s = new Set<string>();
    for (const c of candidats) {
      const ok = fi === "retard" ? c.age >= seuil : fi === "jours" ? c.age >= Math.max(0, n) : true; // nonpayees / toutes → tout
      if (ok) s.add(c.f.id);
    }
    return s;
  };
  const [checked, setChecked] = useState<Set<string>>(() => preselection("retard", seuil));
  function appliquerFiltre(fi: FiltreFDO, n = joursN) { setFiltre(fi); setChecked(preselection(fi, n)); }
  function bascule(id: string) { setChecked((p) => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s; }); }

  const selection = candidats.filter((c) => checked.has(c.f.id));
  const patientsUniq = new Set(selection.map((c) => c.f.objet.trim().toLowerCase())).size;
  const totalSel = selection.reduce((a, c) => a + c.f.montant, 0);

  async function sauverSeuil(v: number) {
    const n = Math.max(0, Math.min(365, Math.round(v)));
    if (n === cfg.joursRetard) return;
    const next = { ...cfg, joursRetard: n };
    setCfg(next); setBusy("seuil");
    const r = await setRapportConfig({ joursRetard: n });
    setBusy(null);
    if (!r.ok) { setCfg(cfg); setFlash({ t: "bad", m: r.error || "Impossible." }); }
    else { setChecked(preselection(filtre, filtre === "jours" ? joursN : n)); setFlash({ t: "ok", m: `Délai de retard réglé à ${n} jour(s).` }); router.refresh(); }
  }

  async function sauverPlan(patch: Partial<RapportConfig>) {
    const next = { ...cfg, ...patch };
    setCfg(next); setBusy("plan");
    const r = await setRapportConfig({ mode: next.mode, heure: next.heure, jour: next.jour });
    setBusy(null);
    if (!r.ok) { setCfg(cfg); setFlash({ t: "bad", m: r.error || "Impossible." }); } else { setFlash({ t: "ok", m: "Planification enregistrée." }); router.refresh(); }
  }

  // Génère la déclaration à partir de la SÉLECTION cochée (récap de sécurité juste
  // au-dessus). Le rapport ne contient QUE les factures cochées.
  async function generer() {
    setBusy("gen");
    const r = await genererRapportImpayes({ medecin: doc.medecin, titre: doc.medecinTitre, factureIds: [...checked], seuil });
    setBusy(null);
    if (!r.ok || !r.rapport) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setDoc(r.rapport); setVue("apercu"); setFlash({ t: "ok", m: `Déclaration générée — ${r.rapport.impayes.length} ligne(s).` });
    setHisto((p) => [{ id: "tmp", at: r.rapport!.genereLe, par: r.rapport!.medecin, nbImpayes: r.rapport!.impayes.length, nbPaiements: r.rapport!.payes.length }, ...p]);
    router.refresh();
  }
  // Actualise les données mais CONSERVE le médecin signataire choisi.
  async function actualiser() { setBusy("ref"); const rp = await rafraichirRapport(); setBusy(null); if (rp) { setDoc((d) => ({ ...rp, medecin: d.medecin, medecinTitre: d.medecinTitre })); setFlash({ t: "ok", m: "Aperçu actualisé." }); } }
  async function copier(pourFDO = false) { try { await navigator.clipboard.writeText(rapportTexte(doc)); setFlash({ t: "ok", m: pourFDO ? "Copié — colle-le dans le salon des forces de l'ordre." : "Rapport copié." }); } catch { setFlash({ t: "bad", m: "Copie impossible." }); } }
  async function voirSnapshot(id: string) { setBusy("snap" + id); const snap = await chargerSnapshotRapport(id); setBusy(null); if (snap) { setDoc(snap); setVue("apercu"); } else setFlash({ t: "bad", m: "Aperçu indisponible." }); }

  return (
    <Modal titre="🚔 Rapport des impayés — Forces de l'ordre" onClose={onClose} max={800}>
      <style>{`@media print { body * { visibility: hidden !important; } .rapport-doc, .rapport-doc * { visibility: visible !important; } .rapport-doc { position: fixed; inset: 0; margin: 0; width: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .rapport-noprint { display: none !important; } }`}</style>
      <div className="flex flex-col gap-3">
        {flash ? <p className="rounded-lg border px-3 py-2 text-[0.8rem]" style={{ borderColor: `color-mix(in srgb,${flash.t === "ok" ? "var(--good)" : "var(--oxblood)"} 45%,var(--border))`, color: flash.t === "ok" ? "var(--good)" : "var(--oxblood)" }}>{flash.m}</p> : null}

        {/* Barre d'actions */}
        <div className="rapport-noprint flex flex-wrap items-center gap-1.5">
          <div className="flex overflow-hidden rounded-lg border border-border text-[0.74rem] font-semibold">
            <button onClick={() => setVue("selection")} className="inline-flex items-center gap-1 px-2.5 py-1.5" style={vue === "selection" ? { background: "var(--accent)", color: "#000" } : { color: "var(--muted)" }}><ListChecks className="h-3.5 w-3.5" /> Sélection</button>
            <button onClick={() => setVue("apercu")} className="px-2.5 py-1.5" style={vue === "apercu" ? { background: "var(--accent)", color: "#000" } : { color: "var(--muted)" }}>Aperçu</button>
            <button onClick={() => setVue("histo")} className="inline-flex items-center gap-1 px-2.5 py-1.5" style={vue === "histo" ? { background: "var(--accent)", color: "#000" } : { color: "var(--muted)" }}><History className="h-3.5 w-3.5" /> Historique ({histo.length})</button>
            <button onClick={() => setVue("plan")} className="inline-flex items-center gap-1 px-2.5 py-1.5" style={vue === "plan" ? { background: "var(--accent)", color: "#000" } : { color: "var(--muted)" }}><CalendarClock className="h-3.5 w-3.5" /> Planification</button>
          </div>
          {vue === "apercu" ? (
            <>
              <button onClick={() => setVue("selection")} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink"><ListChecks className="h-3.5 w-3.5" /> Modifier la sélection</button>
              <button onClick={actualiser} disabled={!!busy} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink disabled:opacity-50">{busy === "ref" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Actualiser</button>
              <button onClick={() => imprimerRapport(doc)} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink"><Printer className="h-3.5 w-3.5" /> Imprimer / PDF</button>
              <button onClick={() => copier(false)} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink"><Copy className="h-3.5 w-3.5" /> Copier</button>
              <button onClick={() => copier(true)} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink"><Send className="h-3.5 w-3.5" /> Envoyer aux FDO</button>
            </>
          ) : null}
        </div>

        {vue === "apercu" || vue === "selection" ? (
          <div className="rapport-noprint flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.05em] text-faint">Médecin signataire</span>
            <select value={doc.medecin} onChange={(e) => choisirMedecin(e.target.value)} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[0.8rem]" title="Choisir le médecin qui édite le document">
              {!medecins.some((m) => m.nom === doc.medecin) ? <option value={doc.medecin}>{doc.medecin} (compte connecté)</option> : null}
              {medecins.map((m) => <option key={m.nom} value={m.nom}>{m.nom}{m.grade ? ` — ${m.grade}` : ""}</option>)}
            </select>
            <span className="text-[0.72rem] text-faint">Signé : <b>Dr. {doc.medecin}</b> · {doc.medecinTitre || TITRE_DEFAUT}</span>
            {medecins.length === 0 ? <span className="text-[0.68rem] italic text-faint">Ajoute des médecins dans les Effectifs (RH) pour les retrouver ici.</span> : null}
          </div>
        ) : null}

        {vue === "selection" ? (
          <div className="rapport-noprint flex flex-col gap-3">
            <p className="text-[0.82rem] text-muted">Par défaut, seules les factures <b>réellement en retard</b> (délai dépassé) sont incluses. Vérifie la sélection ci-dessous <b>avant</b> de générer la déclaration.</p>

            {/* Filtres + délai de retard configurable */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1">
                {FILTRES_FDO.map((o) => (
                  <button key={o.key} onClick={() => appliquerFiltre(o.key)} className="rounded-lg border px-2.5 py-1.5 text-[0.74rem] font-semibold transition" style={filtre === o.key ? { background: "var(--accent)", color: "#000", borderColor: "var(--accent)" } : { color: "var(--muted)", borderColor: "var(--border)" }}>{o.label}</button>
                ))}
              </div>
              {filtre === "jours" ? (
                <label className="inline-flex items-center gap-1.5 text-[0.74rem] text-muted">Dépassant <input type="number" min={0} value={joursN} onChange={(e) => { const n = Math.max(0, Math.round(Number(e.target.value) || 0)); setJoursN(n); appliquerFiltre("jours", n); }} className={inputCls + " w-16 text-center"} /> jours</label>
              ) : null}
              <label className="ml-auto inline-flex items-center gap-1.5 text-[0.74rem] text-muted" title="Réglable par la Direction — enregistré durablement">En retard après <input type="number" min={0} defaultValue={cfg.joursRetard} onBlur={(e) => sauverSeuil(Number(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className={inputCls + " w-16 text-center"} />{busy === "seuil" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} jours</label>
            </div>

            {/* Récapitulatif de sécurité */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-[0.8rem]" style={{ borderColor: "color-mix(in srgb,var(--accent) 40%,var(--border))", background: "color-mix(in srgb,var(--accent) 6%,transparent)" }}>
              <span className="inline-flex items-center gap-1.5 font-semibold"><ListChecks className="h-4 w-4 text-accent" /> {selection.length} facture{selection.length > 1 ? "s" : ""} sélectionnée{selection.length > 1 ? "s" : ""}</span>
              <span className="text-muted">{patientsUniq} patient{patientsUniq > 1 ? "s" : ""}</span>
              <span className="text-muted">Total : <b className="font-num text-ink">{money(totalSel)}</b></span>
              <button onClick={() => setChecked((p) => (p.size === candidats.length ? new Set() : new Set(candidats.map((c) => c.f.id))))} className="ml-auto text-[0.74rem] font-semibold text-accent hover:underline">{checked.size === candidats.length && candidats.length ? "Tout décocher" : "Tout cocher"}</button>
            </div>

            {/* Liste des factures candidates avec cases à cocher */}
            {candidats.length === 0 ? (
              <p className="py-6 text-center text-[0.84rem] italic text-faint">Aucune facture non réglée à déclarer.</p>
            ) : (
              <div className="max-h-[42vh] overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[520px] border-collapse text-left text-[0.8rem]">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="text-[0.64rem] uppercase tracking-[0.05em] text-faint">
                      <th className="border-b border-border px-2 py-2"></th>
                      <th className="border-b border-border px-2 py-2 font-semibold">Patient</th>
                      <th className="border-b border-border px-2 py-2 font-semibold">Émission</th>
                      <th className="border-b border-border px-2 py-2 text-right font-semibold">Retard</th>
                      <th className="border-b border-border px-2 py-2 text-right font-semibold">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidats.map((c) => {
                      const on = checked.has(c.f.id);
                      const enRetard = c.f && c.age >= seuil;
                      return (
                        <tr key={c.f.id} onClick={() => bascule(c.f.id)} className="cursor-pointer hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]" style={on ? { background: "color-mix(in srgb,var(--accent) 7%,transparent)" } : undefined}>
                          <td className="border-b border-border px-2 py-1.5"><input type="checkbox" checked={on} onChange={() => bascule(c.f.id)} onClick={(e) => e.stopPropagation()} className="h-4 w-4 accent-[var(--accent)]" /></td>
                          <td className="border-b border-border px-2 py-1.5 font-semibold">{c.f.objet}</td>
                          <td className="border-b border-border px-2 py-1.5 font-num text-faint">{ddMM(c.f.dateEmission || c.f.createdAt)}</td>
                          <td className="border-b border-border px-2 py-1.5 text-right font-num" style={{ color: enRetard ? "var(--oxblood)" : "var(--warn)" }}>{enRetard ? `${c.retard} j` : <span title="Encore dans les délais">dans les délais</span>}</td>
                          <td className="border-b border-border px-2 py-1.5 text-right font-num">{money(c.f.montant)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {selection.some((c) => c.age < seuil) ? (
              <p className="inline-flex items-center gap-1.5 text-[0.74rem]" style={{ color: "var(--warn)" }}><AlertTriangle className="h-3.5 w-3.5" /> Attention : une ou plusieurs factures sélectionnées ne sont pas encore en retard.</p>
            ) : null}

            <div className="flex justify-end">
              <button onClick={generer} disabled={!!busy || selection.length === 0} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>{busy === "gen" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Générer la déclaration ({selection.length})</button>
            </div>
          </div>
        ) : vue === "plan" ? (
          <div className="rapport-noprint flex flex-col gap-3">
            <p className="text-[0.8rem] text-muted">Choisis la fréquence de génération automatique du rapport. La génération planifiée est assurée par le serveur (Cron).</p>
            <label className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Fréquence</span>
              <select className="rounded-lg border border-border bg-surface px-3 py-2 text-[0.85rem]" value={cfg.mode} onChange={(e) => sauverPlan({ mode: e.target.value as RapportMode })}>{RAPPORT_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
            </label>
            {estModeAuto(cfg.mode) ? (
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Heure</span>
                  <select className="rounded-lg border border-border bg-surface px-3 py-2 text-[0.85rem]" value={cfg.heure} onChange={(e) => sauverPlan({ heure: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}h00</option>)}</select>
                </label>
                {cfg.mode === "hebdo" ? (
                  <label className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Jour</span>
                    <select className="rounded-lg border border-border bg-surface px-3 py-2 text-[0.85rem]" value={cfg.jour} onChange={(e) => sauverPlan({ jour: Number(e.target.value) })}>{JOURS_SEMAINE.map((j, i) => <option key={j} value={i + 1}>{j}</option>)}</select>
                  </label>
                ) : null}
                {cfg.mode === "mensuel" ? (
                  <label className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Jour du mois</span>
                    <select className="rounded-lg border border-border bg-surface px-3 py-2 text-[0.85rem]" value={cfg.jour} onChange={(e) => sauverPlan({ jour: Number(e.target.value) })}>{Array.from({ length: 28 }, (_, d) => <option key={d} value={d + 1}>{d + 1}</option>)}</select>
                  </label>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-center gap-2 text-[0.72rem] text-faint">{busy === "plan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" style={{ color: "var(--good)" }} />} Enregistré automatiquement.</div>
            {cfg.lastAutoAt ? <p className="text-[0.72rem] text-faint">Dernière génération automatique : {dtFR(cfg.lastAutoAt)}.</p> : null}
            <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.72rem] text-faint">Pour activer le Cron : définis la variable <b>CRON_SECRET</b> dans Vercel (projet du dispensaire). Le planificateur vérifie chaque heure et génère à l&apos;heure choisie.</p>
          </div>
        ) : vue === "apercu" ? (
          <div className="max-h-[70vh] overflow-auto rounded-lg">
            <RapportDoc rapport={doc} />
          </div>
        ) : (
          <div className="rapport-noprint flex flex-col gap-1.5">
            <button onClick={() => setVue("apercu")} className="inline-flex w-fit items-center gap-1 text-[0.76rem] font-semibold text-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Retour à l&apos;aperçu</button>
            {histo.length === 0 ? <p className="py-8 text-center text-[0.84rem] italic text-faint">Aucun rapport généré pour l&apos;instant.</p> : histo.map((h) => (
              <div key={h.id + h.at} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[0.8rem]">
                <span className="font-num font-semibold">{dtFR(h.at)}</span>
                <span className="text-faint">· {h.nbImpayes} impayé(s) · {h.nbPaiements} paiement(s){h.par ? ` · ${h.par}` : ""}</span>
                {h.id !== "tmp" ? <button onClick={() => voirSnapshot(h.id)} disabled={busy === "snap" + h.id} className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[0.72rem] font-semibold text-muted hover:text-ink disabled:opacity-50">{busy === "snap" + h.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Aperçu</button> : <span className="ml-auto text-[0.68rem] text-faint">à l&apos;instant</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
