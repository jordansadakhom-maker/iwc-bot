"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, Pencil, Loader2 } from "lucide-react";
import { Modal, inputCls } from "@/components/edit-ui";
import { estAConfirmer } from "@/lib/dispensaire-pointage-const";
import { reprendreService, cloturerParOubli, cloturerManuel } from "@/app/dispensaire/pointage/actions";

const heureFR = (iso: string | null) => { if (!iso) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
// Valeur pour un <input type="datetime-local"> à partir d'une date (heure locale).
function toLocalInput(d: Date) { const off = d.getTimezoneOffset(); return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16); }

// Fenêtre affichée à la (re)connexion quand le service ouvert du compte connecté
// n'a plus donné signe de vie au-delà du seuil d'inactivité (« à confirmer »).
// Le salarié corrige lui-même son oubli : reprendre / clôturer au dernier signal /
// saisir l'heure réelle. Ne s'affiche PAS si le service est encore actif.
export function RepriseService({ id, debut, lastSeen, inactiviteMin = 10 }: { id: string; debut: string; lastSeen: string | null; inactiviteMin?: number }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<"choix" | "manuel">("choix");
  const [manuel, setManuel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Décision côté client (avec l'heure locale réelle) pour éviter tout décalage.
    setShow(estAConfirmer({ fin: null, lastSeen, debut }, inactiviteMin, Date.now()));
    setManuel(toLocalInput(new Date()));
  }, [id, debut, lastSeen, inactiviteMin]);

  if (!show || !id) return null;

  const fermer = () => setShow(false);
  async function reprendre() { setBusy("reprendre"); const r = await reprendreService(id); setBusy(null); if (!r.ok) { setErr(r.error || "Impossible."); return; } setShow(false); router.refresh(); }
  async function oubli() { setBusy("oubli"); const r = await cloturerParOubli(id); setBusy(null); if (!r.ok) { setErr(r.error || "Impossible."); return; } setShow(false); router.refresh(); }
  async function manu() {
    const d = new Date(manuel);
    if (isNaN(d.getTime())) { setErr("Indique une heure de fin valide."); return; }
    setBusy("manuel"); const r = await cloturerManuel(id, d.toISOString()); setBusy(null);
    if (!r.ok) { setErr(r.error || "Impossible."); return; } setShow(false); router.refresh();
  }

  return (
    <Modal titre="Service non clôturé" onClose={fermer} max={460}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.86rem] leading-relaxed text-muted">
          Ton précédent service (débuté <b className="text-ink">{heureFR(debut)}</b>) n&apos;a pas été clôturé. Que souhaites-tu faire&nbsp;?
        </p>

        {mode === "choix" ? (
          <div className="flex flex-col gap-2">
            <button onClick={reprendre} disabled={!!busy} className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-left transition hover:border-border-2 disabled:opacity-60">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: "color-mix(in srgb,var(--good) 16%,transparent)", color: "var(--good)" }}>{busy === "reprendre" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}</span>
              <span><span className="block text-[0.86rem] font-semibold">Reprendre le service</span><span className="block text-[0.74rem] text-faint">J&apos;étais toujours en service — le chrono repart.</span></span>
            </button>
            <button onClick={oubli} disabled={!!busy} className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-left transition hover:border-border-2 disabled:opacity-60">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: "color-mix(in srgb,var(--warn) 16%,transparent)", color: "var(--warn)" }}>{busy === "oubli" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}</span>
              <span><span className="block text-[0.86rem] font-semibold">Clôturer au dernier signal</span><span className="block text-[0.74rem] text-faint">Fin retenue&nbsp;: <b>{heureFR(lastSeen || debut)}</b> (le temps inactif n&apos;est pas compté).</span></span>
            </button>
            <button onClick={() => { setErr(null); setMode("manuel"); }} disabled={!!busy} className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-left transition hover:border-border-2 disabled:opacity-60">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: "color-mix(in srgb,var(--accent) 16%,transparent)", color: "var(--accent)" }}><Pencil className="h-4 w-4" /></span>
              <span><span className="block text-[0.86rem] font-semibold">Indiquer l&apos;heure de fin</span><span className="block text-[0.74rem] text-faint">Je saisis l&apos;heure réelle à laquelle j&apos;ai terminé.</span></span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-[0.72rem] font-semibold uppercase tracking-[0.05em] text-faint">Heure réelle de fin</label>
            <input type="datetime-local" className={inputCls} value={manuel} onChange={(e) => setManuel(e.target.value)} />
            <div className="mt-1 flex items-center justify-between gap-2">
              <button onClick={() => { setErr(null); setMode("choix"); }} className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.82rem] font-semibold hover:border-border-2">Retour</button>
              <button onClick={manu} disabled={busy === "manuel"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy === "manuel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />} Clôturer</button>
            </div>
          </div>
        )}

        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
      </div>
    </Modal>
  );
}
