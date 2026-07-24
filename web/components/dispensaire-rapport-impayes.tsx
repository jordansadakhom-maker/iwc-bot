"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Printer, Copy, History, Loader2, RefreshCw, Send, Check, ArrowLeft, CalendarClock } from "lucide-react";
import { Modal } from "@/components/edit-ui";
import type { RapportImpayes, RapportHisto } from "@/lib/dispensaire-rapport-impayes";
import { RAPPORT_MODES, JOURS_SEMAINE, estModeAuto, type RapportConfig, type RapportMode } from "@/lib/dispensaire-rapport-const";
import { genererRapportImpayes, chargerSnapshotRapport, rafraichirRapport, setRapportConfig } from "@/app/dispensaire/factures/rapport-actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const ddMM = (iso: string | null) => { if (!iso) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
const jourLong = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long" }).format(new Date(iso)); } catch { return "—"; } };
const dtFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };

const INTRO = [
  "Conformément aux dispositions en vigueur, vous trouverez ci-joint la liste des personnes pour lesquelles une facture a été établie, à la suite de soins hospitaliers ou d'interventions en campagne.",
  "Les noms des intéressés ont été inscrits sur chaque facture, accompagnés du montant dû. Aucun contrôle d'identité n'a été effectué de manière contrainte.",
  "Les informations recueillies l'ont été soit sur déclaration verbale des patients, soit par consultation de leur pièce d'identité, avec leur consentement.",
];

function rapportTexte(r: RapportImpayes): string {
  const L: string[] = ["CABINET MÉDICAL DE SAINT-DENIS", "Rapport des impayés des soins, du Dispensaire et de l'Hôpital", "", ...INTRO, "Fait pour servir et valoir ce que de droit.", "", "DATE ET NOM — $", ...r.impayes.map((i) => `${ddMM(i.date)} ${i.nom} — ${Math.round(i.montant)}`)];
  L.push("", "Personnes ayant payé depuis l'envoi du dernier document :");
  if (r.payes.length) L.push(...r.payes.map((p) => `• ${ddMM(p.date)} ${p.nom} — ${Math.round(p.montant)}`)); else L.push("(aucun paiement depuis le dernier rapport)");
  L.push("", "Ci-dessus figure la liste des contrevenants.", "Veuillez agréer l'expression de nos salutations distinguées.", "", `Fait à Saint-Denis, le ${jourLong(r.genereLe)} de l'An de Grâce 1904`, "Dr. Ed Remington — Chef du Cabinet Médical de Saint-Denis");
  return L.join("\n");
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
        <p className="text-[0.78rem]">Date de facturation — nom — $</p>
        <div className="mt-1" style={{ fontFamily: "'Courier New', monospace" }}>
          {r.payes.length ? r.payes.map((p, k) => <div key={k} className="text-[0.86rem]">• {ddMM(p.date)} {p.nom} — {Math.round(p.montant)}</div>) : <p className="text-[0.82rem] italic text-[#6a5c3f]">Aucun paiement depuis le dernier rapport.</p>}
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
          <div className="mt-1 text-[1.3rem]" style={{ fontFamily: "'Segoe Script','Brush Script MT',cursive" }}>Ed Remington</div>
          <div className="text-[0.78rem] font-semibold">Dr. Ed Remington</div>
          <div className="text-[0.72rem] italic">Chef du Cabinet Médical de Saint-Denis</div>
        </div>
        <Stamp tone="#3a3222" l1="State Medical Board" l2="1904" />
      </div>
      <div className="mt-4 border-t border-[#b8a67e] pt-2 text-center text-[0.68rem] uppercase tracking-[0.08em] text-[#6a5c3f]">
        Ars Medicina · Humanitas · Scientia — Primum non nocere
      </div>
    </div>
  );
}

export function RapportImpayesModal({ initial, historique, config, onClose }: { initial: RapportImpayes; historique: RapportHisto[]; config: RapportConfig; onClose: () => void }) {
  const router = useRouter();
  const [doc, setDoc] = useState<RapportImpayes>(initial);
  const [histo, setHisto] = useState<RapportHisto[]>(historique);
  const [vue, setVue] = useState<"apercu" | "histo" | "plan">("apercu");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [cfg, setCfg] = useState<RapportConfig>(config);

  async function sauverPlan(patch: Partial<RapportConfig>) {
    const next = { ...cfg, ...patch };
    setCfg(next); setBusy("plan");
    const r = await setRapportConfig({ mode: next.mode, heure: next.heure, jour: next.jour });
    setBusy(null);
    if (!r.ok) { setCfg(cfg); setFlash({ t: "bad", m: r.error || "Impossible." }); } else { setFlash({ t: "ok", m: "Planification enregistrée." }); router.refresh(); }
  }

  async function generer() {
    setBusy("gen");
    const r = await genererRapportImpayes();
    setBusy(null);
    if (!r.ok || !r.rapport) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setDoc(r.rapport); setFlash({ t: "ok", m: `Rapport généré — ${r.rapport.impayes.length} impayé(s), ${r.rapport.payes.length} paiement(s).` });
    setHisto((p) => [{ id: "tmp", at: r.rapport!.genereLe, par: r.rapport!.medecin, nbImpayes: r.rapport!.impayes.length, nbPaiements: r.rapport!.payes.length }, ...p]);
    router.refresh();
  }
  async function actualiser() { setBusy("ref"); const rp = await rafraichirRapport(); setBusy(null); if (rp) { setDoc(rp); setFlash({ t: "ok", m: "Aperçu actualisé." }); } }
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
            <button onClick={() => setVue("apercu")} className="px-2.5 py-1.5" style={vue === "apercu" ? { background: "var(--accent)", color: "#000" } : { color: "var(--muted)" }}>Aperçu</button>
            <button onClick={() => setVue("histo")} className="inline-flex items-center gap-1 px-2.5 py-1.5" style={vue === "histo" ? { background: "var(--accent)", color: "#000" } : { color: "var(--muted)" }}><History className="h-3.5 w-3.5" /> Historique ({histo.length})</button>
            <button onClick={() => setVue("plan")} className="inline-flex items-center gap-1 px-2.5 py-1.5" style={vue === "plan" ? { background: "var(--accent)", color: "#000" } : { color: "var(--muted)" }}><CalendarClock className="h-3.5 w-3.5" /> Planification</button>
          </div>
          {vue === "apercu" ? (
            <>
              <button onClick={actualiser} disabled={!!busy} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink disabled:opacity-50">{busy === "ref" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Actualiser</button>
              <button onClick={generer} disabled={!!busy} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.74rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--warn)" }}>{busy === "gen" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Générer le rapport</button>
              <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink"><Printer className="h-3.5 w-3.5" /> Imprimer / PDF</button>
              <button onClick={() => copier(false)} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink"><Copy className="h-3.5 w-3.5" /> Copier</button>
              <button onClick={() => copier(true)} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink"><Send className="h-3.5 w-3.5" /> Envoyer aux FDO</button>
            </>
          ) : null}
        </div>

        {vue === "plan" ? (
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
