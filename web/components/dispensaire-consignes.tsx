"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardList, Check, Loader2, History, Lock } from "lucide-react";
import type { ConsigneData, ConsigneLog } from "@/lib/dispensaire-consignes";

type SaveFn = (texte: string) => Promise<{ ok: boolean; error?: string; at?: string; par?: string }>;
const PLACEHOLDER = "Objectifs du jour, un par ligne. Ex. :\n• Produire des seringues d'adrénaline\n• Préparer 30 bandages\n• Vérifier le stock de morphine\n• Commander des matières premières";

const heure = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
function jourLong(ymd: string) { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(ymd + "T12:00:00Z")); } catch { return ymd; } }

export function DispensaireConsignes({ data, canEdit, onSave }: { data: ConsigneData; canEdit: boolean; onSave?: SaveFn }) {
  const [texte, setTexte] = useState(data.texte);
  const [statut, setStatut] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [maj, setMaj] = useState<{ par: string | null; at: string | null }>({ par: data.updatedBy, at: data.updatedAt });
  const [histo, setHisto] = useState<ConsigneLog[]>(data.historique);
  const [voirHisto, setVoirHisto] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dernierEnvoye = useRef(data.texte);

  const editable = canEdit && !!onSave;

  async function sauver(val: string) {
    if (!onSave || val === dernierEnvoye.current) return;
    setStatut("saving"); setErr(null);
    const r = await onSave(val);
    if (!r.ok) { setStatut("error"); setErr(r.error || "Enregistrement impossible."); return; }
    dernierEnvoye.current = val;
    setStatut("saved");
    setMaj({ par: r.par || null, at: r.at || null });
    if (r.at) setHisto((p) => [{ texte: val, par: r.par || null, at: r.at as string }, ...p].slice(0, 10));
  }

  function onChange(val: string) {
    setTexte(val);
    setStatut("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => sauver(val), 1000); // sauvegarde auto après une pause
  }

  // Re-synchronise l'affichage quand le serveur renvoie des données fraîches
  // (rafraîchissement temps réel du tableau de bord). SANS jamais écraser une
  // saisie locale non encore enregistrée. Corrige le bug « la consigne ne reste
  // pas affichée » : les autres membres voyaient un état figé au 1er chargement.
  useEffect(() => {
    setMaj({ par: data.updatedBy, at: data.updatedAt });
    setHisto(data.historique);
    setTexte((cur) => {
      if (cur === dernierEnvoye.current) { dernierEnvoye.current = data.texte; return data.texte; }
      return cur; // édition locale en cours → on préserve la saisie
    });
  }, [data]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <section className="rounded-[14px] border border-border bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><ClipboardList className="h-4 w-4 text-accent" /> Consignes du jour <span className="text-[0.72rem] font-normal capitalize text-faint">· {jourLong(data.jour)}</span></h3>
        <div className="flex items-center gap-2 text-[0.7rem]">
          {statut === "saving" ? <span className="inline-flex items-center gap-1 text-faint"><Loader2 className="h-3 w-3 animate-spin" /> Enregistrement…</span> : null}
          {statut === "saved" ? <span className="inline-flex items-center gap-1" style={{ color: "var(--good)" }}><Check className="h-3 w-3" /> Enregistré</span> : null}
          {statut === "error" ? <span style={{ color: "var(--oxblood)" }}>{err}</span> : null}
          {histo.length ? <button onClick={() => setVoirHisto((v) => !v)} className="inline-flex items-center gap-1 text-faint hover:text-ink"><History className="h-3 w-3" /> Historique</button> : null}
        </div>
      </div>

      {editable ? (
        <textarea
          value={texte}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => { if (timer.current) clearTimeout(timer.current); sauver(texte); }}
          placeholder={PLACEHOLDER}
          rows={Math.max(4, texte.split("\n").length + 1)}
          className="w-full resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.86rem] leading-relaxed outline-none focus:border-border-2"
        />
      ) : texte.trim() ? (
        <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.86rem] leading-relaxed">{texte}</p>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-center text-[0.84rem] italic text-faint">
          {!canEdit ? <Lock className="h-3.5 w-3.5" /> : null} Aucune consigne pour aujourd&apos;hui.
        </p>
      )}

      {maj.at ? <p className="mt-1.5 text-[0.68rem] text-faint">Dernière modification {maj.par ? `par ${maj.par} ` : ""}· {heure(maj.at)}</p> : null}

      {voirHisto && histo.length ? (
        <div className="mt-2 border-t border-border pt-2">
          <div className="mb-1 text-[0.66rem] font-semibold uppercase tracking-[0.05em] text-faint">Historique des modifications</div>
          <div className="flex flex-col gap-1">
            {histo.map((h, i) => (
              <div key={i} className="flex items-baseline gap-2 text-[0.72rem]">
                <span className="shrink-0 font-num text-faint">{heure(h.at)}</span>
                <span className="shrink-0 font-semibold text-muted">{h.par || "—"}</span>
                <span className="min-w-0 flex-1 truncate text-faint">{h.texte.replace(/\s+/g, " ").trim() || "(vidé)"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
