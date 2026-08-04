"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, Loader2, Clock, Inbox } from "lucide-react";
import { Badge } from "@/components/ui";
import type { SanteBot, CommandeLigne } from "@/lib/sante-bot";

function duree(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h${m % 60 ? ` ${m % 60}` : ""}`;
  return `${Math.round(h / 24)} j`;
}
function relatif(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return `il y a ${duree(now - t)}`;
}

const ETATS = {
  ok: { icon: CheckCircle2, tone: "var(--good)", titre: "Bot opérationnel", texte: "La file est vide — les commandes du site sont appliquées normalement." },
  traitement: { icon: Loader2, tone: "var(--warn)", titre: "Traitement en cours", texte: "Des commandes viennent d'arriver — elles s'appliquent sous ~30 s." },
  arret: { icon: AlertTriangle, tone: "var(--oxblood)", titre: "Bot probablement à l'arrêt", texte: "Des commandes attendent depuis trop longtemps. Vérifie que le bot tourne sur Fly.io." },
  indispo: { icon: XCircle, tone: "var(--muted)", titre: "File non joignable", texte: "Impossible de lire la file (table CommandeWeb absente, ou base indisponible)." },
} as const;

export function SanteBotVue({ data }: { data: SanteBot }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(false);

  // Horloge relative (après montage → pas de mismatch SSR) + auto-rafraîchissement.
  useEffect(() => {
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), 15000);
    const sync = window.setInterval(() => router.refresh(), 20000);
    return () => { window.clearInterval(tick); window.clearInterval(sync); };
  }, [router]);

  const rafraichir = () => { setRefresh(true); router.refresh(); window.setTimeout(() => setRefresh(false), 900); };

  const cfg = ETATS[data.etat];
  const Ic = cfg.icon;

  return (
    <div className="flex flex-col gap-4">
      {/* Bandeau de verdict */}
      <div className="relative overflow-hidden rounded-card border p-5 shadow-card" style={{ borderColor: `color-mix(in srgb,${cfg.tone} 45%,var(--border))`, background: `linear-gradient(180deg,color-mix(in srgb,${cfg.tone} 12%,var(--surface)),var(--surface))` }}>
        <span aria-hidden className="absolute left-0 top-0 h-full w-1.5" style={{ background: cfg.tone }} />
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Ic className={`mt-0.5 h-7 w-7 shrink-0 ${data.etat === "traitement" ? "animate-spin" : ""}`} style={{ color: cfg.tone }} />
            <div>
              <h2 className="font-display text-[1.15rem] tracking-[0.02em]" style={{ color: cfg.tone }}>{cfg.titre}</h2>
              <p className="mt-1 max-w-[560px] text-[0.84rem] leading-relaxed text-muted">{cfg.texte}</p>
              {data.etat === "arret" && data.plusVieilleAttenteMs != null ? (
                <p className="mt-1.5 text-[0.8rem] font-semibold" style={{ color: cfg.tone }}>Plus vieille commande en attente : depuis {duree(data.plusVieilleAttenteMs)}.</p>
              ) : null}
              <p className="mt-2 text-[0.72rem] text-faint">
                Dernière commande traitée par le bot : {now == null ? "…" : data.dernierTraitementAt ? relatif(data.dernierTraitementAt, now) : "aucune"}.
              </p>
            </div>
          </div>
          <button onClick={rafraichir} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[0.78rem] font-semibold transition hover:border-accent">
            <RefreshCw className={`h-3.5 w-3.5 ${refresh ? "animate-spin" : ""}`} /> Rafraîchir
          </button>
        </div>
      </div>

      {/* Commandes en attente */}
      <section className="rounded-card border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-accent" />
          <h3 className="text-[0.9rem] font-semibold">Commandes en attente</h3>
          <Badge tone={data.enAttente ? (data.etat === "arret" ? "oxblood" : "warn") : "good"}>{data.enAttente}</Badge>
        </div>
        {data.attente.length === 0 ? (
          <p className="py-4 text-center text-[0.82rem] text-faint">Aucune commande en attente — tout est appliqué. ✅</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.attente.map((c) => <LigneCmd key={c.id} c={c} now={now} tone="var(--warn)" />)}
          </ul>
        )}
      </section>

      {/* Échecs récents */}
      <section className="rounded-card border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-oxblood" />
          <h3 className="text-[0.9rem] font-semibold">Échecs récents</h3>
          <Badge tone={data.echecs ? "oxblood" : "good"}>{data.echecs}</Badge>
        </div>
        {data.echecsListe.length === 0 ? (
          <p className="py-4 text-center text-[0.82rem] text-faint">Aucun échec récent. ✅</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.echecsListe.map((c) => <LigneCmd key={c.id} c={c} now={now} tone="var(--oxblood)" montrerResultat />)}
          </ul>
        )}
      </section>

      <p className="flex items-center justify-center gap-1.5 text-[0.72rem] text-faint">
        <Inbox className="h-3.5 w-3.5" /> Actualisation automatique toutes les 20 s · file « site → bot » (CommandeWeb).
      </p>
    </div>
  );
}

function LigneCmd({ c, now, tone, montrerResultat }: { c: CommandeLigne; now: number | null; tone: string; montrerResultat?: boolean }) {
  return (
    <li className="relative overflow-hidden rounded-[10px] border border-border bg-surface-2 py-2 pl-3.5 pr-3">
      <span aria-hidden className="absolute left-0 top-0 h-full w-1" style={{ background: tone }} />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[0.8rem] font-semibold text-ink">{c.type}</span>
        <span className="shrink-0 text-[0.7rem] text-faint">{now == null ? "…" : relatif(c.createdAt, now)}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[0.72rem] text-faint">
        {c.auteurNom ? <span>par {c.auteurNom}</span> : null}
        {montrerResultat && c.resultat ? <span className="truncate" style={{ color: "color-mix(in srgb,var(--oxblood) 80%,var(--muted))" }}>· {c.resultat}</span> : null}
      </div>
    </li>
  );
}
