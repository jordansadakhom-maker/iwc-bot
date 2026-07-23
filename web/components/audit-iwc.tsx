"use client";

import { useMemo, useState } from "react";
import { Search, Download, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { AuditItem, AuditCouleur } from "@/lib/audit-iwc";
import { Modal, inputCls } from "@/components/edit-ui";

// Couleurs demandées : vert = ajout, rouge = retrait, orange = modification,
// bleu = transfert. (neutre pour les entrées de journal en texte libre.)
const COULEUR: Record<AuditCouleur, string> = {
  ajout: "var(--good)", retrait: "var(--oxblood)", modif: "var(--warn)", transfert: "var(--steel)", neutre: "var(--muted)",
};
const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const PAGE = 25;

const fmtDate = (s: string | null, court = false) => {
  if (!s) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", court
      ? { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
      : { timeZone: "Europe/Paris", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }
    ).format(new Date(s));
  } catch { return "—"; }
};
const signe = (n: number | null) => (n == null ? "" : n > 0 ? `+${n}` : String(n));

type Periode = "today" | "7" | "30" | "all";

export function AuditIWC({ items, pret }: { items: AuditItem[]; pret: boolean }) {
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [couleur, setCouleur] = useState("");
  const [periode, setPeriode] = useState<Periode>("all");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<AuditItem | null>(null);
  const reset = () => setPage(0);

  const sources = useMemo(() => [...new Set(items.map((i) => i.source))].sort(), [items]);
  const query = norm(q.trim());

  const filtres = useMemo(() => {
    const now = Date.now();
    const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
    const cut = periode === "today" ? debutJour.getTime() : periode === "7" ? now - 7 * 86400000 : periode === "30" ? now - 30 * 86400000 : 0;
    return items.filter((i) => {
      if (source && i.source !== source) return false;
      if (couleur && i.couleur !== couleur) return false;
      if (cut && (!i.at || new Date(i.at).getTime() < cut)) return false;
      if (query) {
        const hay = norm([i.par, i.parGrade, i.objet, i.coffre, i.source, i.type, i.commentaire].filter(Boolean).join(" "));
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [items, source, couleur, periode, query]);

  const pages = Math.max(1, Math.ceil(filtres.length / PAGE));
  const p = Math.min(page, pages - 1);
  const slice = filtres.slice(p * PAGE, p * PAGE + PAGE);

  function exportCSV() {
    const head = ["Date", "Source", "Type", "Objet", "Coffre", "Avant", "Après", "Différence", "Par", "Grade", "Commentaire"];
    const cell = (c: unknown) => `"${String(c ?? "").replace(/"/g, '""').replace(/[\r\n]+/g, " ")}"`;
    const lignes = filtres.map((i) => [fmtDate(i.at), i.source, i.type, i.objet ?? "", i.coffre ?? "", i.avant ?? "", i.apres ?? "", signe(i.delta), i.par ?? "", i.parGrade ?? "", i.commentaire ?? ""]);
    const csv = "﻿" + [head, ...lignes].map((r) => r.map(cell).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mouvements-iwc.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const QF: { k: Periode; l: string }[] = [{ k: "today", l: "Aujourd'hui" }, { k: "7", l: "7 jours" }, { k: "30", l: "30 jours" }, { k: "all", l: "Tout" }];

  return (
    <div className="flex flex-col gap-3">
      {!pret ? (
        <div className="rounded-[10px] border px-3 py-2.5 text-[0.82rem]" style={{ color: "var(--warn)", borderColor: "color-mix(in srgb,var(--warn) 45%,var(--border))", background: "color-mix(in srgb,var(--warn) 10%,transparent)" }}>
          Aucune source de mouvements n&apos;est encore disponible. L&apos;historique se remplit dès que des mouvements sont enregistrés (Chasse, Armurerie, coffre commun).
        </div>
      ) : null}

      {/* Filtres rapides + export */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {QF.map((f) => (
            <button key={f.k} onClick={() => { setPeriode(f.k); reset(); }} className="rounded-lg border px-2.5 py-1.5 text-[0.76rem] font-semibold transition"
              style={periode === f.k ? { color: "#000", background: "var(--accent)", borderColor: "var(--accent)" } : { color: "var(--muted)", borderColor: "var(--border)" }}>{f.l}</button>
          ))}
        </div>
        <button onClick={exportCSV} disabled={!filtres.length} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2 disabled:opacity-50">
          <Download className="h-3.5 w-3.5" /> Exporter CSV ({filtres.length})
        </button>
      </div>

      {/* Recherche + sources + type */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className={inputCls + " pl-8"} value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="Rechercher — joueur, grade, objet, coffre…" />
        </div>
        <select className={inputCls + " max-w-[190px]"} value={source} onChange={(e) => { setSource(e.target.value); reset(); }}>
          <option value="">Toutes les sources</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={inputCls + " max-w-[160px]"} value={couleur} onChange={(e) => { setCouleur(e.target.value); reset(); }}>
          <option value="">Tous les types</option>
          <option value="ajout">Ajout / Dépôt</option>
          <option value="retrait">Retrait</option>
          <option value="modif">Modification</option>
          <option value="transfert">Transfert</option>
        </select>
      </div>

      {/* Liste */}
      {slice.length === 0 ? (
        <p className="px-1 py-12 text-center text-[0.85rem] italic text-faint">{items.length ? "Aucun mouvement ne correspond aux filtres." : "Aucun mouvement enregistré pour l'instant."}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {slice.map((i) => {
            const c = COULEUR[i.couleur];
            return (
              <button key={i.id} onClick={() => setDetail(i)} className="flex items-center gap-2.5 rounded-[10px] border border-border bg-surface-2 py-2 pl-2.5 pr-3 text-left transition hover:border-border-2" style={{ borderLeft: `3px solid ${c}` }}>
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[0.64rem] font-bold" style={{ color: c, background: `color-mix(in srgb,${c} 14%,transparent)` }}>{i.type}</span>
                <span className="min-w-0 flex-1 truncate text-[0.82rem]">
                  {i.objet ? <b className="font-semibold">{i.objet}</b> : <span className="text-muted">{i.commentaire || "—"}</span>}
                  {i.coffre ? <span className="text-faint"> · {i.coffre}</span> : null}
                </span>
                {i.avant != null && i.apres != null ? (
                  <span className="hidden shrink-0 items-center gap-1 font-num text-[0.76rem] text-faint sm:flex">{i.avant} <ArrowRight className="h-3 w-3" /> <b style={{ color: c }}>{i.apres}</b></span>
                ) : i.delta != null ? (
                  <span className="hidden shrink-0 font-num text-[0.76rem] font-semibold sm:block" style={{ color: c }}>{signe(i.delta)}</span>
                ) : null}
                <span className="hidden w-28 shrink-0 truncate text-[0.74rem] text-muted md:block">{i.par || "—"}{i.parGrade ? <span className="text-faint"> · {i.parGrade}</span> : null}</span>
                <span className="shrink-0 whitespace-nowrap font-num text-[0.72rem] text-faint">{fmtDate(i.at, true)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {filtres.length > PAGE ? (
        <div className="flex items-center justify-between gap-2 pt-1 text-[0.78rem]">
          <span className="text-faint">{p * PAGE + 1}–{Math.min((p + 1) * PAGE, filtres.length)} sur {filtres.length}</span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPage(Math.max(0, p - 1))} disabled={p === 0} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted transition hover:text-ink disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <span className="font-num text-faint">{p + 1} / {pages}</span>
            <button onClick={() => setPage(Math.min(pages - 1, p + 1))} disabled={p >= pages - 1} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted transition hover:text-ink disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      ) : null}

      {detail ? <DetailModal it={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}

function Ligne({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 last:border-0">
      <span className="shrink-0 text-[0.72rem] uppercase tracking-[0.05em] text-faint">{label}</span>
      <span className="text-right text-[0.84rem]">{children}</span>
    </div>
  );
}

function DetailModal({ it, onClose }: { it: AuditItem; onClose: () => void }) {
  const c = COULEUR[it.couleur];
  return (
    <Modal titre="Détail du mouvement" onClose={onClose} max={480}>
      <div className="flex flex-col">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded px-2 py-0.5 text-[0.72rem] font-bold" style={{ color: c, background: `color-mix(in srgb,${c} 14%,transparent)` }}>{it.type}</span>
          <span className="text-[0.78rem] text-faint">{it.source}</span>
        </div>
        <Ligne label="Date & heure">{fmtDate(it.at)}</Ligne>
        {it.objet ? <Ligne label="Objet"><b>{it.objet}</b></Ligne> : null}
        {it.coffre ? <Ligne label="Coffre / zone">{it.coffre}</Ligne> : null}
        {it.avant != null ? <Ligne label="Quantité avant"><span className="font-num">{it.avant}</span></Ligne> : null}
        {it.apres != null ? <Ligne label="Quantité après"><span className="font-num" style={{ color: c }}>{it.apres}</span></Ligne> : null}
        {it.delta != null ? <Ligne label="Différence"><span className="font-num font-semibold" style={{ color: c }}>{signe(it.delta)}</span></Ligne> : null}
        <Ligne label="Par">{it.par || "—"}</Ligne>
        {it.parGrade ? <Ligne label="Grade">{it.parGrade}</Ligne> : null}
        {it.commentaire ? <Ligne label="Commentaire"><span className="text-muted">{it.commentaire}</span></Ligne> : null}
        <div className="mt-3 flex justify-end">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Fermer</button>
        </div>
      </div>
    </Modal>
  );
}
