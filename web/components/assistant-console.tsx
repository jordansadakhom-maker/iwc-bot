"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Send, Check, HelpCircle, ArrowRight } from "lucide-react";
import { demander, executer } from "@/app/(app)/assistant/actions";
import type { Action, Interpretation } from "@/lib/assistant";
import { MicButton } from "@/components/mic-dictee";

const EXEMPLES = [
  "Passe l'opération Corbeau en cours",
  "Dépose 500 dollars au coffre commun",
  "Crée un contrat d'escorte pour Ross à 1200$, pôle Iron Wolf",
  "Marque le contrat de Wallace comme signé",
  "Ajoute une traque sur Del Lobos, prime 800$, dangerosité élevée",
];

// Étiquette lisible + couleur par famille d'action.
function familleTon(type: string): { label: string; tone: string } {
  const f = type.split(".")[0];
  const map: Record<string, { label: string; tone: string }> = {
    operation: { label: "Opération", tone: "#9085e9" },
    contrat: { label: "Contrat", tone: "#199e70" },
    coffre: { label: "Finances", tone: "#c98500" },
    medical: { label: "Médical", tone: "#e66767" },
    rapport: { label: "Renseignement", tone: "#3987e5" },
    traque: { label: "Traque", tone: "#d95926" },
    contact: { label: "Contact", tone: "var(--accent)" },
  };
  return map[f] || { label: f, tone: "var(--muted)" };
}

export function AssistantConsole() {
  const router = useRouter();
  const [texte, setTexte] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Interpretation | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [done, setDone] = useState<{ executees: number; echecs: number } | null>(null);

  async function interpreter() {
    setErr(null); setRes(null); setDone(null);
    if (texte.trim().length < 3) { setErr("Écris un ordre."); return; }
    setBusy(true);
    const r = await demander(texte);
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible d'interpréter."); return; }
    setRes(r);
  }

  async function confirmer() {
    if (!res?.actions?.length) return;
    setEnvoi(true);
    const r = await executer(res.actions);
    setEnvoi(false);
    if (!r.ok) { setErr(r.error || "Échec de l'exécution."); return; }
    setDone({ executees: r.executees, echecs: r.echecs });
    setRes(null);
    router.refresh();
  }

  function nouveau() {
    setTexte(""); setRes(null); setErr(null); setDone(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Zone de saisie */}
      <div className="rounded-card border border-border bg-surface p-4 shadow-card" style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}>
        <div className="mb-2 flex items-center gap-2 text-[0.78rem] font-semibold text-muted">
          <Sparkles className="h-4 w-4 text-accent" /> Donne un ordre à la compagnie
        </div>
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) interpreter(); }}
          placeholder="Ex : « Passe l'opération Corbeau en cours et dépose 500 au coffre commun »"
          className="min-h-[92px] w-full resize-y rounded-[10px] border border-border bg-surface-2 px-3 py-2.5 text-[0.9rem] text-ink outline-none placeholder:text-faint focus:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]"
          maxLength={2000}
        />
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="hidden text-[0.72rem] text-faint sm:block">⌘/Ctrl + Entrée pour interpréter · 🎙️ ou dicte à la voix</span>
          <div className="flex items-center gap-2">
            <MicButton
              onText={(t) => { setErr(null); setTexte((v) => (v ? v.trim() + " " : "") + t); }}
              onError={(m) => setErr(m)}
              title="Dicter un ordre au micro"
            />
            <button
              onClick={interpreter}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.84rem] font-semibold text-black/85 disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={2} />}
              {busy ? "Réflexion…" : "Interpréter"}
            </button>
          </div>
        </div>

        {!res && !done ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXEMPLES.map((ex) => (
              <button key={ex} onClick={() => setTexte(ex)} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[0.72rem] text-muted transition hover:border-border-2 hover:text-ink">
                {ex}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {err ? (
        <div className="rounded-lg border px-3 py-2.5 text-[0.82rem]" style={{ color: "var(--oxblood)", borderColor: "color-mix(in srgb,var(--oxblood) 40%,var(--border))", background: "color-mix(in srgb,var(--oxblood) 8%,transparent)" }}>
          {err}
        </div>
      ) : null}

      {/* Confirmation des actions proposées */}
      {res ? (
        <div className="rounded-card border border-border bg-surface p-4 shadow-card" style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}>
          {res.resume ? <p className="mb-3 text-[0.9rem] text-ink">{res.resume}</p> : null}

          {res.actions && res.actions.length ? (
            <>
              <div className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-faint">Actions proposées ({res.actions.length})</div>
              <div className="flex flex-col gap-2">
                {res.actions.map((a: Action, i) => {
                  const f = familleTon(a.type);
                  return (
                    <div key={i} className="flex items-start gap-3 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
                      <span className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.04em]" style={{ color: f.tone, background: "color-mix(in srgb," + f.tone + " 15%,transparent)" }}>{f.label}</span>
                      <span className="text-[0.86rem] text-ink">{a.description}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3.5 flex items-center justify-end gap-2">
                <button onClick={nouveau} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
                <button onClick={confirmer} disabled={envoi} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
                  {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" strokeWidth={2} />} Confirmer et exécuter
                </button>
              </div>
            </>
          ) : (
            <p className="text-[0.86rem] text-muted">Aucune action claire à exécuter pour cet ordre.</p>
          )}

          {res.questions && res.questions.length ? (
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.08em] text-faint"><HelpCircle className="h-3.5 w-3.5" /> À préciser</div>
              <ul className="flex flex-col gap-1">
                {res.questions.map((q, i) => <li key={i} className="text-[0.84rem] text-muted">• {q}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Succès */}
      {done ? (
        <div className="rounded-card border p-4 shadow-card" style={{ borderColor: "color-mix(in srgb,var(--good) 40%,var(--border))", background: "color-mix(in srgb,var(--good) 8%,transparent)" }}>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full" style={{ background: "color-mix(in srgb,var(--good) 18%,transparent)", color: "var(--good)" }}><Check className="h-5 w-5" /></span>
            <div>
              <p className="text-[0.9rem] font-semibold">{done.executees} action(s) envoyée(s) à la compagnie.</p>
              <p className="text-[0.8rem] text-muted">Le site et Discord se mettent à jour dans ~30 s.{done.echecs ? ` (${done.echecs} ignorée·s)` : ""}</p>
            </div>
          </div>
          <div className="mt-3"><button onClick={nouveau} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Donner un autre ordre</button></div>
        </div>
      ) : null}
    </div>
  );
}
