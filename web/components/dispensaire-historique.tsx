"use client";

import { useMemo, useState } from "react";
import { History, Search, X } from "lucide-react";
import type { HistoData, HistoItem } from "@/lib/dispensaire-historique";
import { Flash, inputCls } from "@/components/edit-ui";
import { PremiumCard, SectionHeader, EmptyState } from "@/components/dispensaire-premium";
import { jourRelatif, heureCourte } from "@/lib/dispensaire-timefmt";

// Centre d'activité PREMIUM (« main courante ») — flux horodaté de tout ce qui
// est porté au registre : recherche plein-texte, filtres rapides par module
// (puces avec compteurs), sélecteur d'action, regroupement par jour. Toute la
// logique de filtrage d'origine est conservée.

const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const MOD_TONE: Record<string, string> = { Stockage: "var(--accent)", "Stock Matériel Médical": "var(--good)", Ventes: "var(--good)", Pointage: "var(--accent)", Frais: "var(--warn)", Factures: "var(--crit)", Certificats: "var(--accent)", Rapports: "var(--accent)", RH: "var(--warn)", "Matières": "var(--warn)", FDO: "var(--accent)" };
const ACT_TONE: Record<string, string> = { "Entrée": "var(--good)", Sortie: "var(--crit)", "Déplacement": "var(--warn)", "Nouveau coffre": "var(--good)", "Coffre modifié": "var(--accent)" };
const tonMod = (m: string) => MOD_TONE[m] || "var(--steel)";

export function DispensaireHistorique({ data }: { data: HistoData }) {
  const [q, setQ] = useState("");
  const [mod, setMod] = useState("");
  const [act, setAct] = useState("");
  const query = norm(q);
  const liste = useMemo(() => data.items.filter((i: HistoItem) => (!mod || i.module === mod) && (!act || i.action === act) && (!query || norm([i.module, i.action, i.cible, i.coffre, i.detail, i.par].filter(Boolean).join(" ")).includes(query))), [data.items, mod, act, query]);

  // Décompte par module (sur l'ensemble) pour dimensionner les puces de filtre.
  const parModule = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of data.items) m.set(i.module, (m.get(i.module) || 0) + 1);
    return m;
  }, [data.items]);

  const actif = mod || act || q;

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">L&apos;historique s&apos;alimentera dès que les modules contiennent des données (SQL exécuté).</Flash> : null}

      <SectionHeader
        eyebrow="Main courante"
        titre="Centre d'activité"
        sous="Tout ce qui est porté au registre — le plus récent en tête."
        icon={History}
        actions={
          <div className="flex items-center gap-2">
            <span className="font-num text-[0.82rem] text-faint">{liste.length}</span>
            <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><input className={inputCls + " w-48 pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" /></div>
            <select className={inputCls + " max-w-[150px]"} value={act} onChange={(e) => setAct(e.target.value)}><option value="">Toutes les actions</option>{data.actions.map((a) => <option key={a} value={a}>{a}</option>)}</select>
            {actif ? <button type="button" onClick={() => { setMod(""); setAct(""); setQ(""); }} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[0.72rem] font-semibold text-muted transition hover:text-ink"><X className="h-3.5 w-3.5" /> Effacer</button> : null}
          </div>
        }
      />

      {/* Puces de filtre par module (compteurs) */}
      {data.modules.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip label="Tous" n={data.items.length} on={!mod} onClick={() => setMod("")} />
          {data.modules.map((m) => <Chip key={m} label={m} n={parModule.get(m) || 0} tone={tonMod(m)} on={mod === m} onClick={() => setMod(mod === m ? "" : m)} />)}
        </div>
      ) : null}

      {liste.length === 0 ? (
        data.items.length
          ? <EmptyState icon={Search} titre="Aucune entrée ne correspond" sous="Ajuste ta recherche ou tes filtres pour retrouver une écriture." />
          : <EmptyState icon={History} titre="La main courante est vierge" sous="Chaque écriture portée au registre — soin, stock, personnel, facture — viendra s'inscrire ici, la plus récente en tête." />
      ) : (
        <PremiumCard lift={false} className="overflow-hidden">
          <ol className="flex flex-col">
            {liste.map((i, idx) => {
              const ton = tonMod(i.module);
              const jour = jourRelatif(i.at);
              const nouveauJour = idx === 0 || jour !== jourRelatif(liste[idx - 1].at);
              return (
                <li key={i.id}>
                  {nouveauJour ? (
                    <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-faint" style={{ background: "color-mix(in srgb,var(--surface) 92%,transparent)", backdropFilter: "blur(6px)" }}>
                      {jour}<span className="h-px flex-1" style={{ background: "color-mix(in srgb,var(--ink) 8%,transparent)" }} />
                    </div>
                  ) : null}
                  <div className="flex items-start gap-2.5 border-t px-3 py-2 transition hover:bg-surface-2" style={{ borderColor: "color-mix(in srgb,var(--ink) 6%,transparent)" }}>
                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: ton }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.82rem]">
                        <span className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.03em]" style={{ color: ton, background: `color-mix(in srgb,${ton} 13%,transparent)` }}>{i.module}</span>
                        <span className="font-semibold" style={{ color: ACT_TONE[i.action] || "var(--ink)" }}>{i.action}</span>
                        {i.cible ? <span className="font-medium">· {i.cible}</span> : null}
                        {i.coffre ? <span className="text-faint">· {i.coffre}</span> : null}
                      </div>
                      {i.detail ? <div className="mt-0.5 truncate text-[0.75rem] text-muted">{i.detail}</div> : null}
                    </div>
                    <div className="shrink-0 whitespace-nowrap text-right font-num text-[0.7rem] text-faint">
                      <div>{heureCourte(i.at)}</div>
                      {i.par ? <div className="text-[0.66rem]">{i.par}</div> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </PremiumCard>
      )}
    </div>
  );
}

// Puce de filtre compacte (module) avec compteur.
function Chip({ label, n, tone, on, onClick }: { label: string; n: number; tone?: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold transition"
      style={on ? { color: "#fff", background: tone || "var(--accent)", borderColor: "transparent" } : { color: "var(--muted)", borderColor: "var(--border)", background: "var(--surface-2)" }}>
      {tone ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "#fff" : tone }} /> : null}
      {label} <span className="font-num opacity-75">{n}</span>
    </button>
  );
}
