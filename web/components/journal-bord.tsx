import { CalendarClock, MapPin, Users, Globe, ScrollText, CheckCircle2 } from "lucide-react";
import type { JournalRdv } from "@/lib/queries";

const dateFR = (s: string | null) => {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
};

// Journal de bord : la trace complète des rendez-vous clôturés (livre de bord).
export function JournalBord({ rdvs }: { rdvs: JournalRdv[] }) {
  if (rdvs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-4 py-16 text-center shadow-card">
        <span className="grid h-12 w-12 place-items-center rounded-full border" style={{ borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))", background: "color-mix(in srgb,var(--accent) 8%,transparent)" }}>
          <ScrollText className="h-5 w-5" style={{ color: "color-mix(in srgb,var(--accent) 70%,var(--faint))" }} strokeWidth={1.6} />
        </span>
        <p className="max-w-md font-display text-[0.92rem] italic text-muted">Le livre de bord est vierge. Clôture un rendez-vous depuis la Communication et il s&apos;inscrira ici — avec son résultat et sa date.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {rdvs.map((r) => (
        <div key={r.id} className="rounded-card border border-border bg-surface p-4 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--good)" }} />
                <span className="truncate text-[1rem] font-semibold">{r.nomRP || "Client"}</span>
                {r.source === "web" ? <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase" style={{ color: "var(--accent)", background: "color-mix(in srgb,var(--accent) 14%,transparent)" }}><Globe className="h-2.5 w-2.5" /> site</span> : null}
              </div>
              {r.type ? <div className="mt-0.5 text-[0.82rem] text-muted">{r.type}</div> : null}
            </div>
            <div className="text-right text-[0.72rem] text-faint">
              <div>Clôturé le {dateFR(r.closedAt)}</div>
              {r.closedBy ? <div className="mt-0.5">par {r.closedBy}</div> : null}
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.76rem] text-faint">
            {r.creneau ? <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> {r.creneau}</span> : null}
            {r.lieu ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {r.lieu}</span> : null}
            {r.assignes.length ? <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {r.assignes.join(", ")}</span> : null}
          </div>

          {r.resultat ? (
            <div className="mt-2.5 rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[0.84rem]">
              <span className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Résultat</span>
              <p className="mt-0.5 whitespace-pre-wrap text-ink">{r.resultat}</p>
            </div>
          ) : null}

          {r.reponses.length ? (
            <div className="mt-2 text-[0.72rem] text-faint">{r.reponses.length} note(s) / réponse(s) conservée(s) dans la trace.</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
