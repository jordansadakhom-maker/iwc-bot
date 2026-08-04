"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Loader2, Plus, Check, Clock, Trash2, UserCheck, CircleDot, Circle, AlarmClock, Sparkles } from "lucide-react";
import { Card, CardHeader, Empty, Badge } from "@/components/ui";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { PRIORITES, prioriteMeta, estFaite, estEnRetard, trierTaches, type Tache } from "@/lib/taches";
import type { Suggestion } from "@/lib/attribution";
import { creerTache, majStatutTache, assignerTacheAMoi, assignerTacheA, suggererMembres, supprimerTache } from "@/app/(app)/taches/actions";

const dateFR = (s: string | null) => {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "—"; }
};
function echeanceLabel(t: Tache, now: number): string {
  if (!t.echeance) return "";
  const j = Math.ceil((new Date(t.echeance).getTime() - now) / 86400000);
  if (Number.isNaN(j)) return dateFR(t.echeance);
  if (estFaite(t)) return dateFR(t.echeance);
  if (j < 0) return `en retard de ${Math.abs(j)} j`;
  if (j === 0) return "échéance aujourd'hui";
  if (j === 1) return "échéance demain";
  return `dans ${j} j`;
}

type Filtre = "actives" | "moi" | "faites" | "toutes";
const badgeTone = (tone: string): "accent" | "good" | "warn" | "muted" | "oxblood" =>
  (["accent", "good", "warn", "muted", "oxblood"].includes(tone) ? tone : "accent") as "accent" | "good" | "warn" | "muted" | "oxblood";

function LigneTache({ t, moiId, onStatut, onMoi, onSuggerer, onSuppr, busy, now, suggOuvert }: {
  t: Tache; moiId: string | null; now: number;
  onStatut: (id: string, statut: string) => void; onMoi: (id: string) => void; onSuggerer: (t: Tache) => void; onSuppr: (t: Tache) => void; busy: boolean; suggOuvert: boolean;
}) {
  const p = prioriteMeta(t.priorite);
  const faite = estFaite(t);
  const retard = estEnRetard(t, now);
  const accent = retard ? "var(--oxblood)" : "var(--" + p.tone + ")";
  const StatutIc = faite ? Check : t.statut === "en_cours" ? CircleDot : Circle;
  return (
    <div className="relative flex items-start gap-3 overflow-hidden rounded-[12px] border p-3.5 pl-4" style={{ borderColor: faite ? "var(--border)" : `color-mix(in srgb,${accent} 24%,var(--border))`, background: faite ? "var(--surface-2)" : "linear-gradient(160deg,color-mix(in srgb,var(--surface-2) 94%,transparent),color-mix(in srgb,var(--surface-2) 82%,#000))" }}>
      <span aria-hidden className="absolute left-0 top-0 h-full w-1" style={{ background: faite ? "var(--good)" : accent }} />
      <button
        onClick={() => onStatut(t.id, faite ? "a_faire" : "faite")} disabled={busy}
        title={faite ? "Rouvrir" : "Marquer faite"}
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border transition disabled:opacity-50"
        style={{ color: faite ? "var(--good)" : "var(--muted)", borderColor: faite ? "color-mix(in srgb,var(--good) 55%,var(--border))" : "var(--border)", background: faite ? "color-mix(in srgb,var(--good) 14%,transparent)" : "transparent" }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <StatutIc className="h-4 w-4" strokeWidth={1.9} />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={"text-[0.9rem] font-semibold " + (faite ? "text-faint line-through" : "")}>{t.titre}</span>
          {!faite ? <Badge tone={badgeTone(p.tone)}>{p.label}</Badge> : null}
          {t.pole === "confrerie" ? <Badge tone="oxblood">Confrérie</Badge> : t.pole === "iwc" ? <Badge tone="accent">IWC</Badge> : null}
          {retard ? <Badge tone="oxblood">En retard</Badge> : null}
        </div>
        {t.detail ? <div className="mt-1 whitespace-pre-wrap text-[0.8rem] text-muted">{t.detail}</div> : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.74rem] text-faint">
          {t.echeance ? (
            <span className={retard ? "inline-flex items-center gap-1 font-semibold" : "inline-flex items-center gap-1"} style={retard ? { color: "var(--oxblood)" } : undefined}>
              {retard ? <AlarmClock className="h-3 w-3" /> : <Clock className="h-3 w-3" />} {echeanceLabel(t, now)}
            </span>
          ) : null}
          {t.assigneNom ? <span className="inline-flex items-center gap-1"><UserCheck className="h-3 w-3" /> {t.assigneNom}</span> : <span className="italic">Non assignée</span>}
          {t.creePar ? <span>· par {t.creePar}</span> : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {!faite && t.statut !== "en_cours" ? (
          <button onClick={() => onStatut(t.id, "en_cours")} disabled={busy} className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-[0.7rem] font-semibold text-muted transition hover:text-ink disabled:opacity-50">En cours</button>
        ) : null}
        {!faite && !t.assigneId ? (
          <button onClick={() => onSuggerer(t)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[0.7rem] font-semibold transition disabled:opacity-50" style={{ color: suggOuvert ? "#000" : "var(--accent)", background: suggOuvert ? "var(--accent)" : "transparent", borderColor: "color-mix(in srgb,var(--accent) 45%,var(--border))" }}><Sparkles className="h-3 w-3" /> Suggérer</button>
        ) : null}
        {!faite && t.assigneId !== moiId ? (
          <button onClick={() => onMoi(t.id)} disabled={busy} className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-[0.7rem] font-semibold text-muted transition hover:text-ink disabled:opacity-50">Pour moi</button>
        ) : null}
        <button onClick={() => onSuppr(t)} disabled={busy} title="Supprimer" className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-[0.7rem] font-semibold text-muted transition hover:text-[var(--oxblood)] disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

export function TachesBoard({ connecte, moiId, taches }: { connecte: boolean; moiId: string | null; taches: Tache[] }) {
  const router = useRouter();
  const now = Date.now();
  const [filtre, setFiltre] = useState<Filtre>("actives");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ t: "good" | "bad"; m: string } | null>(null);
  const [open, setOpen] = useState(false);
  // Attribution assistée : id de la tâche dont on affiche les suggestions.
  const [suggFor, setSuggFor] = useState<string | null>(null);
  const [suggData, setSuggData] = useState<Suggestion[]>([]);
  const [suggBusy, setSuggBusy] = useState(false);

  // Formulaire de création
  const [titre, setTitre] = useState("");
  const [detail, setDetail] = useState("");
  const [priorite, setPriorite] = useState("normale");
  const [echeance, setEcheance] = useState("");
  const [pole, setPole] = useState("");
  const [pourMoi, setPourMoi] = useState(false);
  const [saving, setSaving] = useState(false);

  const compte = useMemo(() => ({
    actives: taches.filter((t) => !estFaite(t)).length,
    moi: taches.filter((t) => !estFaite(t) && t.assigneId === moiId).length,
    faites: taches.filter((t) => estFaite(t)).length,
    toutes: taches.length,
  }), [taches, moiId]);

  const liste = useMemo(() => {
    let l = taches;
    if (filtre === "actives") l = taches.filter((t) => !estFaite(t));
    else if (filtre === "moi") l = taches.filter((t) => !estFaite(t) && t.assigneId === moiId);
    else if (filtre === "faites") l = taches.filter((t) => estFaite(t));
    return trierTaches(l, now);
  }, [taches, filtre, moiId, now]);

  function resetForm() { setTitre(""); setDetail(""); setPriorite("normale"); setEcheance(""); setPole(""); setPourMoi(false); }

  async function soumettre() {
    if (!titre.trim()) { setFlash({ t: "bad", m: "Donne un titre à la tâche." }); return; }
    setSaving(true); setFlash(null);
    const res = await creerTache({ titre, detail, priorite, echeance: echeance ? new Date(echeance).toISOString() : undefined, pourMoi, pole: pole || undefined });
    setSaving(false);
    if (res.ok) { setOpen(false); resetForm(); setFlash({ t: "good", m: "Tâche ajoutée." }); router.refresh(); }
    else setFlash({ t: "bad", m: res.error || "Échec de l'enregistrement." });
  }

  async function agir(fn: () => Promise<{ ok: boolean; error?: string }>, id: string, okMsg?: string) {
    setBusyId(id); setFlash(null);
    const res = await fn();
    setBusyId(null);
    if (res.ok) { if (okMsg) setFlash({ t: "good", m: okMsg }); router.refresh(); }
    else setFlash({ t: "bad", m: res.error || "Échec." });
  }

  async function suppr(t: Tache) {
    if (!confirm(`Supprimer la tâche « ${t.titre} » ?`)) return;
    agir(() => supprimerTache(t.id), t.id, "Tâche supprimée.");
  }

  async function ouvrirSuggestions(t: Tache) {
    if (suggFor === t.id) { setSuggFor(null); return; }
    setSuggFor(t.id); setSuggData([]); setSuggBusy(true); setFlash(null);
    const r = await suggererMembres(t.pole || undefined);
    setSuggBusy(false);
    setSuggData(r.ok ? r.suggestions : []);
  }

  async function assignerA(t: Tache, sugg: Suggestion) {
    setSuggFor(null);
    await agir(() => assignerTacheA(t.id, sugg.id, sugg.nom), t.id, `Assignée à ${sugg.nom}.`);
  }

  if (!connecte) {
    return <Card><Empty icon={ListChecks}>Connecte-toi avec Discord pour voir et gérer les tâches de la compagnie.</Empty></Card>;
  }

  const TABS: { key: Filtre; label: string; n: number }[] = [
    { key: "actives", label: "À faire", n: compte.actives },
    { key: "moi", label: "Mes tâches", n: compte.moi },
    { key: "faites", label: "Faites", n: compte.faites },
    { key: "toutes", label: "Toutes", n: compte.toutes },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((tb) => {
            const on = filtre === tb.key;
            return (
              <button key={tb.key} onClick={() => setFiltre(tb.key)}
                className="rounded-lg border px-3 py-1.5 text-[0.78rem] font-semibold transition"
                style={{ color: on ? "#000" : "var(--muted)", background: on ? "var(--accent)" : "transparent", borderColor: on ? "var(--accent)" : "var(--border)" }}>
                {tb.label} <span className="opacity-70">{tb.n}</span>
              </button>
            );
          })}
        </div>
        <button onClick={() => { resetForm(); setFlash(null); setOpen(true); }}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[0.85rem] font-semibold text-black/85"
          style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>
          <Plus className="h-4 w-4" /> Nouvelle tâche
        </button>
      </div>

      {flash && !open ? <div className="mb-4"><Flash tone={flash.t}>{flash.m}</Flash></div> : null}

      <Card>
        <CardHeader titre={TABS.find((t) => t.key === filtre)?.label || "Tâches"} compteur={liste.length} />
        {liste.length === 0 ? (
          <Empty icon={filtre === "faites" ? Check : ListChecks}>
            {filtre === "faites" ? "Aucune tâche terminée pour l'instant." : filtre === "moi" ? "Aucune tâche ne t'est assignée. 🐺" : "Aucune tâche en cours. Tout est sous contrôle."}
          </Empty>
        ) : (
          <div className="flex flex-col gap-2.5">
            {liste.map((t) => (
              <div key={t.id}>
                <LigneTache t={t} moiId={moiId} now={now} busy={busyId === t.id} suggOuvert={suggFor === t.id}
                  onStatut={(id, statut) => agir(() => majStatutTache(id, statut), id)}
                  onMoi={(id) => agir(() => assignerTacheAMoi(id), id, "Tâche assignée.")}
                  onSuggerer={ouvrirSuggestions}
                  onSuppr={suppr} />
                {suggFor === t.id ? (
                  <div className="mb-2 rounded-[11px] border border-border bg-surface-2 p-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[0.72rem] font-semibold uppercase tracking-[0.05em] text-faint"><Sparkles className="h-3 w-3" style={{ color: "var(--accent)" }} /> Membres suggérés</div>
                    {suggBusy ? (
                      <div className="flex items-center justify-center py-3 text-muted"><Loader2 className="h-4 w-4 animate-spin" /></div>
                    ) : suggData.length === 0 ? (
                      <div className="px-1 py-2 text-[0.78rem] italic text-faint">Aucun membre disponible à suggérer.</div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {suggData.map((sg, i) => (
                          <div key={sg.id} className="flex items-center gap-2.5 rounded-[9px] border border-border bg-surface px-2.5 py-1.5">
                            {i === 0 ? <Badge tone="accent">Top</Badge> : <span className="w-1" />}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5"><span className="truncate text-[0.84rem] font-semibold">{sg.nom}</span>{sg.grade ? <span className="text-[0.7rem] text-faint">· {sg.grade}</span> : null}</div>
                              <div className="truncate text-[0.7rem] text-muted">{sg.raisons.join(" · ")}</div>
                            </div>
                            <button onClick={() => assignerA(t, sg)} disabled={busyId === t.id} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[0.72rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}><UserCheck className="h-3 w-3" /> Assigner</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {open ? (
        <Modal titre="Nouvelle tâche" onClose={() => setOpen(false)} max={480}>
          <div className="flex flex-col gap-3.5">
            {flash ? <Flash tone={flash.t}>{flash.m}</Flash> : null}
            <Champ label="Titre">
              <input className={inputCls} value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. Relancer le client Miller" maxLength={200} autoFocus />
            </Champ>
            <Champ label="Détail (optionnel)">
              <textarea className={inputCls + " min-h-[72px] resize-y"} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Contexte, consignes…" maxLength={2000} />
            </Champ>
            <Champ label="Priorité">
              <Picker options={PRIORITES.map((p) => ({ key: p.key, label: p.label, tone: "var(--" + p.tone + ")" }))} value={priorite} onChange={setPriorite} />
            </Champ>
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Échéance (optionnel)">
                <input type="date" className={inputCls} value={echeance} onChange={(e) => setEcheance(e.target.value)} />
              </Champ>
              <Champ label="Pôle (optionnel)">
                <select className={inputCls} value={pole} onChange={(e) => setPole(e.target.value)}>
                  <option value="">— Aucun —</option>
                  <option value="iwc">IWC</option>
                  <option value="confrerie">Confrérie</option>
                </select>
              </Champ>
            </div>
            <label className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[0.82rem]">
              <input type="checkbox" checked={pourMoi} onChange={(e) => setPourMoi(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              <span>Me l'assigner tout de suite</span>
            </label>
            <div className="mt-1 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-xl border border-border px-4 py-2.5 text-[0.85rem] font-semibold text-muted hover:text-ink">Annuler</button>
              <button onClick={soumettre} disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[0.85rem] font-semibold text-black/85 disabled:opacity-60"
                style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />} Créer
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
