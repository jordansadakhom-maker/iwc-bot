"use client";

import { useState } from "react";
import { DoorOpen, BedDouble, User, Stethoscope } from "lucide-react";
import { type Chambre, type EtatChambre, ETAT_CHAMBRE_LABEL, ETAT_CHAMBRE_TON, ETATS_CHAMBRE } from "@/lib/dispensaire-chambres-const";

// Plan interactif 2D du dispensaire — les chambres, faute de coordonnées en base,
// sont disposées en deux ailes séparées d'un couloir (comme un plan d'étage
// dessiné à l'encre sur le registre). Chaque pièce est colorée LIVE selon son
// état et cliquable pour en voir le détail. 100 % client, données sérialisables.
function Piece({ c, on, onClick }: { c: Chambre; on: boolean; onClick: () => void }) {
  const ton = ETAT_CHAMBRE_TON[c.etat];
  return (
    <button type="button" onClick={onClick} title={`${c.nom} — ${ETAT_CHAMBRE_LABEL[c.etat]}`}
      className="relative flex min-w-[96px] flex-1 flex-col gap-1 rounded-[4px] border p-2 text-left transition"
      style={{ borderColor: on ? ton : "color-mix(in srgb,var(--ink) 28%,transparent)", background: `color-mix(in srgb,${ton} ${c.etat === "libre" ? 7 : 15}%, var(--surface))`, boxShadow: on ? `0 0 0 2px ${ton}` : undefined }}>
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[0.7rem] font-bold uppercase tracking-[0.03em]">{c.nom}</span>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ton }} />
      </div>
      <BedDouble className="h-5 w-5" style={{ color: ton, opacity: c.etat === "libre" ? 0.4 : 0.9 }} />
      <span className="truncate text-[0.64rem] text-muted">{c.patient || ETAT_CHAMBRE_LABEL[c.etat]}</span>
    </button>
  );
}

export function DispensairePlanChambres({ chambres }: { chambres: Chambre[] }) {
  const [sel, setSel] = useState<string | null>(null);
  if (!chambres.length) return null;

  const mid = Math.ceil(chambres.length / 2);
  const ailes = [chambres.slice(0, mid), chambres.slice(mid)];
  const selChambre = chambres.find((c) => c.id === sel) || null;
  const compte = (e: EtatChambre) => chambres.filter((c) => c.etat === e).length;

  return (
    <section className="rounded-[14px] border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-[1.05rem]"><DoorOpen className="h-4 w-4 text-accent" /> Plan du dispensaire</h3>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem]">
          {ETATS_CHAMBRE.map((e) => (
            <span key={e} className="inline-flex items-center gap-1 text-muted"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ETAT_CHAMBRE_TON[e] }} /> {ETAT_CHAMBRE_LABEL[e]} <b className="font-num text-ink">{compte(e)}</b></span>
          ))}
        </div>
      </div>

      {/* Le plan : deux ailes de chambres, un couloir central. */}
      <div className="rounded-[8px] border-2 p-3" style={{ borderColor: "color-mix(in srgb,var(--ink) 22%,transparent)", background: "color-mix(in srgb,var(--accent) 3%,transparent)" }}>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">{ailes[0].map((c) => <Piece key={c.id} c={c} on={c.id === sel} onClick={() => setSel(c.id === sel ? null : c.id)} />)}</div>
          {ailes[1].length ? (
            <>
              <div className="my-0.5 flex items-center justify-center rounded-[3px] py-1 text-[0.58rem] font-bold uppercase tracking-[0.32em] text-faint" style={{ background: "color-mix(in srgb,var(--ink) 7%,transparent)" }}>Couloir</div>
              <div className="flex flex-wrap gap-2">{ailes[1].map((c) => <Piece key={c.id} c={c} on={c.id === sel} onClick={() => setSel(c.id === sel ? null : c.id)} />)}</div>
            </>
          ) : null}
        </div>
      </div>

      {/* Détail de la chambre sélectionnée. */}
      {selChambre ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[0.8rem]">
          <span className="font-bold">{selChambre.nom}</span>
          <span className="inline-flex items-center gap-1 font-semibold" style={{ color: ETAT_CHAMBRE_TON[selChambre.etat] }}>● {ETAT_CHAMBRE_LABEL[selChambre.etat]}</span>
          {selChambre.type ? <span className="text-faint">{selChambre.type}</span> : null}
          {selChambre.patient ? <span className="inline-flex items-center gap-1 text-muted"><User className="h-3.5 w-3.5" /> {selChambre.patient}</span> : null}
          {selChambre.medecin ? <span className="inline-flex items-center gap-1 text-muted"><Stethoscope className="h-3.5 w-3.5" /> {selChambre.medecin}</span> : null}
          {selChambre.note ? <span className="text-faint">— {selChambre.note}</span> : null}
        </div>
      ) : <p className="mt-2 text-[0.72rem] italic text-faint">Clique une chambre pour voir le détail (patient, médecin, note).</p>}
    </section>
  );
}
