"use client";

import { useState } from "react";
import { FileText, ScrollText, Megaphone, Mail, Skull, Sparkles, Printer, Copy, Check, Loader2, RefreshCw, Medal, ScanLine, Send } from "lucide-react";
import { genererDocument, genererDepuisCapture, genererRapportMission, envoyerDocument, type DocType } from "@/app/(app)/documents/actions";
import { PhotoDrop } from "@/components/photo-drop";

type Mode = DocType | "mission";
type OpLite = { id: string; titre: string; lieu: string | null };

const TYPES: { key: Mode; label: string; sous: string; icon: typeof FileText }[] = [
  { key: "rapport", label: "Rapport d'opération", sous: "Compte-rendu après mission", icon: FileText },
  { key: "mission", label: "Rapport de mission", sous: "Bilan immersif d'une opération", icon: Medal },
  { key: "ordre", label: "Ordre de mission", sous: "Briefing à distribuer", icon: ScrollText },
  { key: "communique", label: "Communiqué", sous: "Annonce publique", icon: Megaphone },
  { key: "lettre", label: "Lettre officielle", sous: "Courrier d'époque", icon: Mail },
  { key: "avis", label: "Avis de recherche", sous: "Affiche « Wanted »", icon: Skull },
];

const inputCls = "w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-[0.88rem] text-ink outline-none placeholder:text-faint focus:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]";

export function GenerateurDocuments({ operations = [] }: { operations?: OpLite[] }) {
  const [type, setType] = useState<Mode>("rapport");
  const [sujet, setSujet] = useState("");
  const [details, setDetails] = useState("");
  const [pole, setPole] = useState<"iwc" | "confrerie">("iwc");
  const [opId, setOpId] = useState("");
  const [texte, setTexte] = useState("");
  const [busy, setBusy] = useState<"gen" | "capture" | "envoi" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [destinataire, setDestinataire] = useState("");
  const [envoiFlash, setEnvoiFlash] = useState<string | null>(null);

  async function generer() {
    setErr(null);
    if (type === "mission") {
      if (!opId) { setErr("Choisis une opération."); return; }
      setBusy("gen");
      const r = await genererRapportMission(opId);
      setBusy(null);
      if (!r.ok) { setErr(r.error || "Échec."); return; }
      setTexte(r.texte || "");
      return;
    }
    if (sujet.trim().length < 2) { setErr("Indique un sujet / titre."); return; }
    setBusy("gen");
    const r = await genererDocument(type as DocType, { sujet, details, pole });
    setBusy(null);
    if (!r.ok) { setErr(r.error || "Échec."); return; }
    setTexte(r.texte || "");
  }

  async function analyserCapture(url: string) {
    setErr(null); setBusy("capture");
    const r = await genererDepuisCapture(url, pole);
    setBusy(null);
    if (!r.ok) { setErr(r.error || "Lecture impossible."); return; }
    setTexte(r.texte || "");
  }

  async function envoyer() {
    setEnvoiFlash(null);
    if (!destinataire.trim()) { setEnvoiFlash("Indique l'ID Discord du destinataire."); return; }
    setBusy("envoi");
    const r = await envoyerDocument(destinataire, TYPES.find((t) => t.key === type)?.label || "Document", texte);
    setBusy(null);
    setEnvoiFlash(r.ok ? ((r as { message?: string }).message || "Document envoyé en message privé.") : (r.error || "Échec de l'envoi."));
  }

  function imprimer() { if (typeof window !== "undefined") window.print(); }
  async function copier() { try { await navigator.clipboard.writeText(texte); setCopie(true); setTimeout(() => setCopie(false), 1500); } catch {} }

  const libelle = TYPES.find((t) => t.key === type)?.label || "Document";

  return (
    <>
      <style>{`@media print{body *{visibility:hidden!important}#doc-imprimable,#doc-imprimable *{visibility:visible!important}#doc-imprimable{position:fixed;inset:0;margin:0;padding:30px 40px}.no-print{display:none!important}}`}</style>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* ── Composition ── */}
        <div className="no-print flex flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-card">
          <div>
            <div className="mb-2 text-[0.66rem] uppercase tracking-[0.06em] text-faint">Type de document</div>
            <div className="grid gap-2">
              {TYPES.map((t) => {
                const on = t.key === type;
                return (
                  <button key={t.key} onClick={() => setType(t.key)} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition" style={{ borderColor: on ? "var(--accent)" : "var(--border)", background: on ? "color-mix(in srgb,var(--accent) 12%,var(--surface))" : "var(--surface-2)" }}>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ color: on ? "var(--accent)" : "var(--muted)", background: on ? "color-mix(in srgb,var(--accent) 16%,transparent)" : "var(--surface)" }}>
                      <t.icon className="h-[1.05rem] w-[1.05rem]" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[0.85rem] font-semibold">{t.label}</span>
                      <span className="block truncate text-[0.7rem] text-faint">{t.sous}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {type === "mission" ? (
            <label className="block">
              <span className="mb-1 block text-[0.66rem] uppercase tracking-[0.06em] text-faint">Opération</span>
              {operations.length === 0 ? (
                <p className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[0.8rem] text-faint">Aucune opération à rapporter pour l&apos;instant.</p>
              ) : (
                <select className={inputCls} value={opId} onChange={(e) => setOpId(e.target.value)}>
                  <option value="">— Choisir une opération —</option>
                  {operations.map((o) => <option key={o.id} value={o.id}>{o.titre}{o.lieu ? ` · ${o.lieu}` : ""}</option>)}
                </select>
              )}
              <p className="mt-1 text-[0.68rem] text-faint">Le rapport reprend les faits réels de l&apos;opération (résultat, butin, pertes…) et les met en récit — sans rien inventer.</p>
            </label>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-[0.66rem] uppercase tracking-[0.06em] text-faint">Sujet / titre</span>
                <input className={inputCls} value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder="Ex. Escorte de la diligence de Rhodes" maxLength={160} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.66rem] uppercase tracking-[0.06em] text-faint">Éléments à intégrer <span className="text-faint/70">(facultatif)</span></span>
                <textarea className={inputCls + " min-h-[100px] resize-y leading-relaxed"} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Agents, lieu, résultat, montant, consignes… L'IA ne fabrique rien." maxLength={2000} />
              </label>
            </>
          )}

          <div>
            <div className="mb-1 text-[0.66rem] uppercase tracking-[0.06em] text-faint">Émetteur</div>
            <div className="flex gap-2">
              {(["iwc", "confrerie"] as const).map((p) => (
                <button key={p} onClick={() => setPole(p)} className="flex-1 rounded-lg border px-2.5 py-1.5 text-[0.78rem] font-semibold transition" style={{ borderColor: pole === p ? (p === "iwc" ? "var(--brass)" : "var(--oxblood)") : "var(--border)", color: pole === p ? "var(--ink)" : "var(--muted)", background: pole === p ? `color-mix(in srgb,${p === "iwc" ? "var(--brass)" : "var(--oxblood)"} 14%,transparent)` : "var(--surface-2)" }}>
                  {p === "iwc" ? "Iron Wolf" : "La Confrérie"}
                </button>
              ))}
            </div>
          </div>

          {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}

          <button onClick={generer} disabled={busy !== null} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[0.9rem] font-semibold text-black/85 transition hover:brightness-110 disabled:opacity-60" style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>
            {busy === "gen" ? <Loader2 className="h-[1.05rem] w-[1.05rem] animate-spin" /> : texte ? <RefreshCw className="h-[1.05rem] w-[1.05rem]" /> : <Sparkles className="h-[1.05rem] w-[1.05rem]" />}
            {busy === "gen" ? "Rédaction en cours…" : texte ? "Régénérer" : "Générer le document"}
          </button>

          {/* Analyser une capture */}
          <div className="border-t border-border pt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[0.66rem] uppercase tracking-[0.06em] text-faint"><ScanLine className="h-3.5 w-3.5" /> Ou : analyser une capture</div>
            {busy === "capture" ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-4 text-[0.82rem] text-muted"><Loader2 className="h-4 w-4 animate-spin" /> L&apos;IA lit la capture…</div>
            ) : (
              <PhotoDrop dossier="documents-captures" onUploaded={analyserCapture} label="Glisse une capture — l'IA l'analyse et rédige le document qui correspond" />
            )}
          </div>
        </div>

        {/* ── Aperçu / édition ── */}
        <div className="rounded-card border border-border bg-surface shadow-card">
          <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <span className="text-[0.82rem] font-semibold text-muted">{libelle}{texte ? " — modifiable avant impression" : ""}</span>
            {texte ? (
              <div className="flex gap-2">
                <button onClick={copier} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.75rem] font-semibold text-muted hover:text-ink">{copie ? <Check className="h-3.5 w-3.5" style={{ color: "var(--good)" }} /> : <Copy className="h-3.5 w-3.5" />}{copie ? "Copié" : "Copier"}</button>
                <button onClick={imprimer} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.75rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Printer className="h-3.5 w-3.5" /> Imprimer / PDF</button>
              </div>
            ) : null}
          </div>

          {texte ? (
            <>
              <textarea className="no-print h-[52vh] w-full resize-none border-0 bg-transparent px-5 py-4 font-display text-[0.95rem] leading-relaxed text-ink outline-none" value={texte} onChange={(e) => setTexte(e.target.value)} />
              {/* Envoyer à quelqu'un */}
              <div className="no-print border-t border-border px-4 py-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[0.66rem] uppercase tracking-[0.06em] text-faint"><Send className="h-3.5 w-3.5" /> Envoyer à quelqu&apos;un (message privé Discord)</div>
                <div className="flex flex-wrap items-center gap-2">
                  <input className={inputCls + " flex-1"} value={destinataire} onChange={(e) => setDestinataire(e.target.value)} placeholder="ID Discord du destinataire" />
                  <button onClick={envoyer} disabled={busy === "envoi"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
                    {busy === "envoi" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Envoyer
                  </button>
                </div>
                {envoiFlash ? <p className="mt-1.5 text-[0.78rem]" style={{ color: /envoy|priv/i.test(envoiFlash) ? "var(--good)" : "var(--oxblood)" }}>{envoiFlash}</p> : null}
              </div>
              {/* Version imprimable */}
              <div id="doc-imprimable" className="hidden" aria-hidden>
                <div style={{ fontFamily: "Iowan Old Style, Palatino, Georgia, serif", color: "#1a1206", whiteSpace: "pre-wrap", fontSize: "13pt", lineHeight: 1.55 }}>
                  <div style={{ textAlign: "center", letterSpacing: "3px", fontWeight: 700, fontSize: "12pt", borderBottom: "2px solid #1a1206", paddingBottom: "8px", marginBottom: "18px" }}>
                    {pole === "confrerie" ? "LA CONFRÉRIE" : "IRON WOLF COMPANY"}
                  </div>
                  {texte}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl text-accent" style={{ background: "color-mix(in srgb,var(--accent) 12%,transparent)" }}><Sparkles className="h-6 w-6" /></span>
              <p className="max-w-sm text-[0.88rem] text-muted">Choisis un type et génère, <b className="text-ink">rapporte une opération</b>, ou <b className="text-ink">glisse une capture</b> à analyser. Le document apparaîtra ici — modifiable, imprimable et envoyable, sans jamais rien inventer.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
