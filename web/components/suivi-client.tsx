"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Loader2, CalendarClock, MapPin, Crosshair, Inbox, MessageSquare, MailOpen } from "lucide-react";
import { chercherSuivi, type SuiviResult } from "@/app/suivi/actions";

const dateFR = (n?: number) => { if (!n) return ""; try { return new Date(n).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

const RDV_LABEL: Record<string, { t: string; c: string }> = {
  nouveau: { t: "En attente", c: "var(--warn)" }, confirme: { t: "Confirmé", c: "var(--steel)" },
  honore: { t: "Honoré", c: "var(--good)" }, annule: { t: "Annulé", c: "var(--faint)" }, lapin: { t: "Absence notée", c: "var(--oxblood)" },
};
const CTR_LABEL: Record<string, { t: string; c: string }> = {
  brouillon: { t: "En préparation", c: "var(--faint)" }, envoye: { t: "À signer", c: "var(--warn)" },
  signe: { t: "Signé", c: "var(--good)" }, refuse: { t: "Refusé", c: "var(--oxblood)" }, honore: { t: "Honoré", c: "var(--good)" },
};
function Pastille({ map, k }: { map: Record<string, { t: string; c: string }>; k: string }) {
  const cfg = map[k] || { t: k || "—", c: "var(--muted)" };
  return <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.04em]" style={{ color: cfg.c, background: `color-mix(in srgb,${cfg.c} 16%,transparent)` }}>{cfg.t}</span>;
}

export function SuiviClient({ initialNom = "" }: { initialNom?: string }) {
  const [nom, setNom] = useState(initialNom);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SuiviResult | null>(null);

  const chercherNom = useCallback(async (valeur: string) => {
    if (valeur.trim().length < 2) { setRes({ ok: false, rdvs: [], contrats: [], telegrammes: [], error: "Entre ton nom (2 lettres minimum)." }); return; }
    setBusy(true);
    setRes(await chercherSuivi(valeur));
    setBusy(false);
  }, []);
  const chercher = () => chercherNom(nom);

  // Arrivée depuis « Télégramme envoyé » (?nom=…) : on affiche direct son suivi.
  useEffect(() => { if (initialNom.trim().length >= 2) chercherNom(initialNom); }, [initialNom, chercherNom]);

  return (
    <div className="w-full max-w-[560px]">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-3 text-[0.92rem] text-ink outline-none placeholder:text-faint focus:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]"
          value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") chercher(); }}
          placeholder="Ton nom (celui donné à la compagnie)…" maxLength={80}
        />
        <button onClick={chercher} disabled={busy} className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[0.9rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>
          {busy ? <Loader2 className="h-[1.1rem] w-[1.1rem] animate-spin" /> : <Search className="h-[1.1rem] w-[1.1rem]" />} Voir mon suivi
        </button>
      </div>

      {res && !res.ok ? <p className="mt-3 text-[0.85rem]" style={{ color: "var(--oxblood)" }}>{res.error}</p> : null}

      {res && res.ok && res.vide ? (
        <div className="mt-5 flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-8 text-center">
          <Inbox className="h-7 w-7 text-faint" />
          <p className="text-[0.86rem] text-muted">Aucun rendez-vous, contrat ni télégramme trouvé au nom de « {res.nom} ». Vérifie l&apos;orthographe (écris ton nom exactement comme sur ta demande), ou <a href="/rendez-vous" className="font-semibold text-accent underline decoration-dotted">prends rendez-vous</a>.</p>
        </div>
      ) : null}

      {res && res.ok && !res.vide ? (
        <div className="mt-5 flex flex-col gap-4">
          {res.rdvs.length ? (
            <section className="rounded-2xl border border-border bg-surface p-4">
              <div className="mb-2 text-[0.68rem] uppercase tracking-[0.1em] text-faint">Tes rendez-vous</div>
              <ul className="divide-y divide-border">
                {res.rdvs.map((r, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.88rem] font-medium text-ink">{r.type}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[0.74rem] text-faint">
                        {r.creneau ? <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {r.creneau}</span> : null}
                        {r.lieu ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {r.lieu}</span> : null}
                      </span>
                    </span>
                    <Pastille map={RDV_LABEL} k={r.statut} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {res.contrats.length ? (
            <section className="rounded-2xl border border-border bg-surface p-4">
              <div className="mb-2 text-[0.68rem] uppercase tracking-[0.1em] text-faint">Tes contrats de vente</div>
              <ul className="divide-y divide-border">
                {res.contrats.map((c, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5">
                    <Crosshair className="h-4 w-4 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate text-[0.88rem] font-medium text-ink">{c.arme}{c.prix > 0 ? <span className="font-num text-faint"> · {c.prix.toLocaleString("fr-FR")}$</span> : null}</span>
                    <Pastille map={CTR_LABEL} k={c.statut} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {res.telegrammes.length ? (
            <section className="rounded-2xl border border-border bg-surface p-4">
              <div className="mb-2.5 text-[0.68rem] uppercase tracking-[0.1em] text-faint">Tes télégrammes</div>
              <ul className="flex flex-col gap-3">
                {res.telegrammes.map((t, i) => (
                  <li key={i} className="rounded-xl border border-border bg-surface-2 p-3">
                    <div className="flex items-start gap-2">
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
                      <p className="min-w-0 flex-1 whitespace-pre-wrap text-[0.84rem] leading-relaxed text-muted">{t.message}</p>
                    </div>
                    {t.reponses.length ? (
                      <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                        {t.reponses.map((r, j) => (
                          <div key={j} className="rounded-lg px-3 py-2" style={{ background: "color-mix(in srgb,var(--good) 10%,var(--surface))", border: "1px solid color-mix(in srgb,var(--good) 30%,var(--border))" }}>
                            <div className="mb-0.5 flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.05em]" style={{ color: "var(--good)" }}>
                              <MailOpen className="h-3 w-3" /> Réponse de la compagnie{r.at ? <span className="font-normal normal-case tracking-normal text-faint"> · {dateFR(r.at)}</span> : null}
                            </div>
                            <p className="whitespace-pre-wrap text-[0.84rem] leading-relaxed text-ink">{r.texte}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2.5 border-t border-border pt-2.5 text-[0.74rem] text-faint">En attente de réponse — repasse ici plus tard, la réponse de l&apos;équipe s&apos;affichera ici.</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
