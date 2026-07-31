"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Boxes, FlaskConical, Receipt, FileText, BadgeDollarSign, Users, CalendarClock, Activity, GripVertical, EyeOff, Plus, Settings2, Check } from "lucide-react";
import type { AccueilData } from "@/lib/dispensaire-accueil";
import { StatWidget } from "@/components/dispensaire-premium";

// Cockpit du tableau de bord — grille de widgets PERSONNALISABLE (réordonnable
// par glisser-déposer + masquage), mémorisée PAR COMPTE. Composant CLIENT : les
// icônes et le formateur restent côté client (frontière RSC respectée) ; la page
// ne passe que des données sérialisables + l'action serveur de sauvegarde.
const money = (n: number) => `$${Math.round(n).toLocaleString("fr-FR")}`;
type SaveFn = (prefs: { ordre: string[]; masques: string[] }) => Promise<{ ok: boolean }>;
type Widget = { key: string; label: string; node: ReactNode };

export function DispensaireAccueilCockpit({ d, rdvAujourdhui, ordre = [], masques = [], onSave }: { d: AccueilData; rdvAujourdhui: number; ordre?: string[]; masques?: string[]; onSave?: SaveFn }) {
  const stockCrit = d.stockAlertes.length;
  const matRupture = d.matieresRupture.length;

  // Tous les widgets disponibles (clé stable + libellé + rendu).
  const widgets = useMemo<Widget[]>(() => [
    { key: "medecins", label: "Médecins en service", node: <StatWidget label="Médecins en service" value={d.enService.length} icon={Users} tone="good" live href="/dispensaire/pointage" sous={d.enService.length ? d.enService.slice(0, 2).map((s) => s.nom).join(" · ") : "Personne en service"} /> },
    { key: "rdv", label: "RDV aujourd'hui", node: <StatWidget label="RDV aujourd'hui" value={rdvAujourdhui} icon={CalendarClock} href="/dispensaire/rendez-vous" sous={rdvAujourdhui ? "Consultations prévues" : "Aucun rendez-vous"} /> },
    { key: "soins", label: "Soins du jour", node: <StatWidget label="Soins du jour" value={d.ventesJourNb} icon={Activity} tone="good" href="/dispensaire/ventes" sous={`Recette ${money(d.ventesJourCa)}`} /> },
    { key: "stocks", label: "Stocks critiques", node: <StatWidget label="Stocks critiques" value={stockCrit} icon={Boxes} tone={stockCrit ? "crit" : "steel"} href="/dispensaire/stockage" sous={stockCrit ? d.stockAlertes.slice(0, 2).map((s) => s.nom).join(" · ") : "Tout au-dessus du seuil"} /> },
    { key: "matieres", label: "Matières en rupture", node: <StatWidget label="Matières en rupture" value={matRupture} icon={FlaskConical} tone={matRupture ? "crit" : "steel"} href="/dispensaire/matieres" sous={matRupture ? d.matieresRupture.slice(0, 2).map((m) => m.nom).join(" · ") : "Rien à commander"} /> },
    { key: "frais", label: "Frais en attente", node: <StatWidget label="Frais en attente" value={d.fraisEnAttente} icon={FileText} tone={d.fraisEnAttente ? "warn" : "steel"} href="/dispensaire/frais" sous={d.fraisEnAttente ? "À valider" : "Rien en attente"} /> },
    ...(d.habilite ? [{ key: "factures", label: "Factures impayées", node: <StatWidget label="Factures impayées" value={d.facturesImpayees} icon={Receipt} tone={d.facturesRetard ? "crit" : "warn"} href="/dispensaire/factures" sous={`${d.facturesRetard} en retard · ${money(d.du)} dû`} /> }] : []),
    { key: "recette", label: "Recette du jour", node: <StatWidget label="Recette du jour" value={d.ventesJourCa} format={money} icon={BadgeDollarSign} tone="good" href="/dispensaire/ventes" sous="Ventes encaissées aujourd'hui" /> },
  ], [d, rdvAujourdhui, stockCrit, matRupture]);

  const cles = useMemo(() => widgets.map((w) => w.key), [widgets]);
  const map = useMemo(() => new Map(widgets.map((w) => [w.key, w])), [widgets]);
  // Ordre effectif : l'ordre sauvegardé (filtré aux clés existantes) + les nouvelles clés à la fin.
  const ordonner = (ord: string[]) => { const base = ord.filter((k) => cles.includes(k)); for (const k of cles) if (!base.includes(k)) base.push(k); return base; };

  const [order, setOrder] = useState<string[]>(() => ordonner(ordre));
  const [hidden, setHidden] = useState<string[]>(() => masques.filter((k) => cles.includes(k)));
  const [edit, setEdit] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);

  // Resynchronise si la liste des widgets disponibles change (ex. habilitation).
  useEffect(() => { setOrder((o) => ordonner(o)); }, [cles.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const persister = (ord: string[], masq: string[]) => { if (onSave) onSave({ ordre: ord, masques: masq }).catch(() => {}); };
  const visibles = order.filter((k) => !hidden.includes(k) && map.has(k));
  const masquesVisibles = order.filter((k) => hidden.includes(k) && map.has(k));

  const deposer = (cible: string) => {
    if (!drag || drag === cible) { setDrag(null); return; }
    const next = [...order];
    next.splice(next.indexOf(drag), 1);
    next.splice(next.indexOf(cible), 0, drag);
    setOrder(next); setDrag(null); persister(next, hidden);
  };
  const masquer = (k: string) => { const h = [...hidden, k]; setHidden(h); persister(order, h); };
  const afficher = (k: string) => { const h = hidden.filter((x) => x !== k); setHidden(h); persister(order, h); };

  return (
    <div className="flex flex-col gap-2">
      {onSave ? (
        <div className="flex items-center justify-end">
          <button type="button" onClick={() => setEdit((e) => !e)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.72rem] font-semibold transition"
            style={edit ? { color: "#fff", background: "var(--accent)", borderColor: "transparent" } : { color: "var(--muted)", borderColor: "var(--border)", background: "var(--surface-2)" }}>
            {edit ? <><Check className="h-3.5 w-3.5" /> Terminé</> : <><Settings2 className="h-3.5 w-3.5" /> Personnaliser</>}
          </button>
        </div>
      ) : null}

      <div className="disp-rise grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {visibles.map((k) => {
          const w = map.get(k);
          if (!w) return null;
          return (
            <div key={k} className={`relative ${drag === k ? "opacity-40" : ""}`}>
              {w.node}
              {edit ? (
                <div draggable onDragStart={() => setDrag(k)} onDragEnd={() => setDrag(null)} onDragOver={(e) => e.preventDefault()} onDrop={() => deposer(k)}
                  className="absolute inset-0 z-10 flex cursor-move items-start justify-between p-1.5"
                  style={{ borderRadius: "var(--r-lg)", background: "color-mix(in srgb,var(--accent) 9%,transparent)", border: "1px dashed color-mix(in srgb,var(--accent) 45%,transparent)" }}>
                  <GripVertical className="h-4 w-4 text-accent" />
                  <button type="button" onClick={(e) => { e.stopPropagation(); masquer(k); }} title="Masquer ce widget"
                    className="grid h-6 w-6 place-items-center rounded-md border border-border bg-surface text-muted transition hover:text-ink">
                    <EyeOff className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {edit && masquesVisibles.length ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-[12px] border border-dashed border-border bg-surface-2 px-3 py-2">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-faint">Masqués :</span>
          {masquesVisibles.map((k) => {
            const w = map.get(k);
            return w ? (
              <button key={k} type="button" onClick={() => afficher(k)} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-[0.72rem] font-semibold text-muted transition hover:text-ink">
                <Plus className="h-3 w-3" /> {w.label}
              </button>
            ) : null;
          })}
        </div>
      ) : null}
    </div>
  );
}
