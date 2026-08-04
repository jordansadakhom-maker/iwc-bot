"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Loader2, Inbox, UserCheck, Clock, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Modal, Flash, inputCls } from "@/components/edit-ui";
import { STATUTS_DEMANDE, PRIORITES_DEMANDE, TYPES_DEMANDE, statutDemandeDef, prioriteDemandeDef, typeDemandeDef, depuis, STATUTS_OUVERTS, type Demande, type DemandesData } from "@/lib/demandes-const";
import { creerDemande } from "@/app/(app)/demandes/actions";

function Pastille({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.66rem] font-semibold" style={{ background: `color-mix(in srgb,${tone} 16%,transparent)`, color: tone }}>{children}</span>;
}

export function DemandesBoard({ data, monId }: { data: DemandesData; monId: string | null }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [vue, setVue] = useState<"toutes" | "ouvertes" | "miennes" | "non_assignees">("ouvertes");
  const [fStatut, setFStatut] = useState("");
  const [fType, setFType] = useState("");
  const [form, setForm] = useState(false);
  const [pending, start] = useTransition();

  const liste = useMemo(() => {
    const t = q.trim().toLowerCase();
    return data.demandes.filter((d) => {
      if (vue === "ouvertes" && !STATUTS_OUVERTS.includes(d.statut as never)) return false;
      if (vue === "miennes" && d.assigneId !== monId) return false;
      if (vue === "non_assignees" && (d.assigneId || !STATUTS_OUVERTS.includes(d.statut as never))) return false;
      if (fStatut && d.statut !== fStatut) return false;
      if (fType && d.type !== fType) return false;
      if (t && !(d.titre.toLowerCase().includes(t) || (d.resume || "").toLowerCase().includes(t) || d.ref.toLowerCase().includes(t) || d.auteurNom.toLowerCase().includes(t))) return false;
      return true;
    });
  }, [data.demandes, q, vue, fStatut, fType, monId]);

  const vues: { key: typeof vue; label: string; n: number; icon: typeof Inbox }[] = [
    { key: "ouvertes", label: "Ouvertes", n: data.stats.ouvertes, icon: Inbox },
    { key: "miennes", label: "Les miennes", n: data.stats.miennes, icon: UserCheck },
    { key: "non_assignees", label: "Non assignées", n: data.stats.nonAssignees, icon: Clock },
    { key: "toutes", label: "Toutes", n: data.stats.total, icon: Inbox },
  ];

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/demandes.sql</b> dans le Supabase principal, puis recharge.</Flash> : null}

      {/* KPI + vues */}
      <div className="flex flex-wrap items-center gap-2">
        {vues.map((v) => (
          <button key={v.key} onClick={() => setVue(v.key)} aria-pressed={vue === v.key}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.78rem] font-semibold transition"
            style={vue === v.key ? { background: "var(--accent)", color: "#000", borderColor: "transparent" } : { color: "var(--muted)", borderColor: "var(--border)" }}>
            <v.icon className="h-3.5 w-3.5" /> {v.label} <span className="rounded-full px-1.5 text-[0.64rem] font-bold" style={vue === v.key ? { background: "rgba(0,0,0,.18)" } : { background: "var(--surface-2)", color: "var(--faint)" }}>{v.n}</span>
          </button>
        ))}
        <button onClick={() => setForm(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-4 w-4" /> Nouvelle demande</button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (titre, n°, auteur…)" className="w-52 rounded-lg border border-border bg-surface-2 py-1.5 pl-7 pr-2 text-[0.78rem] outline-none focus:border-accent" />
        </div>
        <select value={fType} onChange={(e) => setFType(e.target.value)} className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[0.76rem]"><option value="">Tous les types</option>{TYPES_DEMANDE.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
        <select value={fStatut} onChange={(e) => setFStatut(e.target.value)} className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[0.76rem]"><option value="">Tous les statuts</option>{STATUTS_DEMANDE.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
      </div>

      {/* Liste */}
      {liste.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <Inbox className="h-6 w-6 text-faint" />
          <p className="max-w-md text-[0.85rem] text-muted">Aucune demande ici. Crée-en une avec « Nouvelle demande » — chaque dossier aura sa conversation et son suivi.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {liste.map((d) => <LigneDemande key={d.id} d={d} monId={monId} />)}
        </div>
      )}

      {form ? <FormDemande onClose={() => setForm(false)} onCree={(id) => { setForm(false); toast("Demande créée.", "ok"); start(() => router.push(`/demandes/${id}`)); }} busy={pending} /> : null}
    </div>
  );
}

function LigneDemande({ d, monId }: { d: Demande; monId: string | null }) {
  const st = statutDemandeDef(d.statut);
  const pr = prioriteDemandeDef(d.priorite);
  const ty = typeDemandeDef(d.type);
  const mien = d.assigneId && d.assigneId === monId;
  return (
    <Link href={`/demandes/${d.id}`} className="relative flex items-start gap-3 overflow-hidden rounded-[12px] border px-3 py-2.5 pl-4 transition hover:-translate-y-0.5 hover:border-border-2" style={{ borderColor: `color-mix(in srgb,${pr.tone} 22%,var(--border))`, background: "linear-gradient(160deg,color-mix(in srgb,var(--surface-2) 94%,transparent),color-mix(in srgb,var(--surface-2) 82%,#000))" }}>
      <span aria-hidden className="absolute left-0 top-0 h-full w-1" style={{ background: pr.tone }} />
      <span className="mt-0.5 text-[1.1rem]" aria-hidden>{ty.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[0.88rem] font-semibold">{d.titre}</span>
          <span className="shrink-0 font-num text-[0.68rem] text-faint">{d.ref}</span>
        </div>
        {d.resume ? <div className="mt-0.5 truncate text-[0.8rem] text-muted">{d.resume}</div> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Pastille tone={st.tone}>{st.label}</Pastille>
          <Pastille tone={pr.tone}>{pr.label}</Pastille>
          <span className="text-[0.68rem] text-faint">{ty.label} · {d.auteurNom} · {depuis(d.createdAt)}</span>
        </div>
      </div>
      <div className="shrink-0 text-right text-[0.68rem] text-faint">
        {d.assigneNom ? <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5" style={mien ? { color: "var(--good)", borderColor: "color-mix(in srgb,var(--good) 40%,var(--border))" } : undefined}><UserCheck className="h-3 w-3" /> {mien ? "toi" : d.assigneNom}</span> : <span className="italic text-faint">non assignée</span>}
      </div>
    </Link>
  );
}

function FormDemande({ onClose, onCree, busy }: { onClose: () => void; onCree: (id: string) => void; busy: boolean }) {
  const [v, setV] = useState({ titre: "", type: "prestation", priorite: "normale", resume: "" });
  const [err, setErr] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  async function creer() {
    if (!v.titre.trim()) { setErr("Donne un titre."); return; }
    setEnvoi(true); setErr(null);
    const r = await creerDemande(v);
    setEnvoi(false);
    if (!r.ok || !r.id) { setErr(r.error || "Impossible."); return; }
    onCree(r.id);
  }
  return (
    <Modal titre="Nouvelle demande" onClose={onClose} max={560}>
      <div className="flex flex-col gap-3">
        {err ? <Flash tone="bad">{err}</Flash> : null}
        <label className="text-[0.78rem] font-semibold">Titre<input value={v.titre} onChange={(e) => setV({ ...v, titre: e.target.value })} className={`mt-1 ${inputCls}`} placeholder="Objet de la demande" autoFocus /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[0.78rem] font-semibold">Type<select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} className={`mt-1 ${inputCls}`}>{TYPES_DEMANDE.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
          <label className="text-[0.78rem] font-semibold">Priorité<select value={v.priorite} onChange={(e) => setV({ ...v, priorite: e.target.value })} className={`mt-1 ${inputCls}`}>{PRIORITES_DEMANDE.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
        </div>
        <label className="text-[0.78rem] font-semibold">Détails<textarea value={v.resume} onChange={(e) => setV({ ...v, resume: e.target.value })} rows={4} className={`mt-1 ${inputCls}`} placeholder="Décris la demande — ce texte ouvre la conversation." /></label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[0.8rem] font-semibold text-muted hover:text-ink"><X className="h-3.5 w-3.5" /> Annuler</button>
          <button onClick={creer} disabled={envoi || busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{envoi || busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Créer la demande</button>
        </div>
      </div>
    </Modal>
  );
}
