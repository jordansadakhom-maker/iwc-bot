"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Loader2, Trash2, Users, CalendarClock, Landmark, Check } from "lucide-react";
import type { ContratDetail } from "@/lib/queries";
import { Badge } from "@/components/ui";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { creerContrat, majContrat, supprimerContrat, majSuiviContrat, honorerContrat } from "@/app/(app)/operations/actions";
import { cents } from "@/lib/format";

const dateFR = (s: string | null) => { if (!s) return null; try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }); } catch { return null; } };

// Pipeline de suivi (5 étapes, comme sur Discord).
const SUIVI = ["En attente", "En cours", "Validé", "Honoré", "Abandonné"];
const SUIVI_TONE: Record<string, "warn" | "accent" | "good" | "muted"> = {
  "En attente": "warn", "En cours": "accent", "Validé": "good", "Honoré": "good", "Abandonné": "muted",
};
// Déduit l'étape de suivi depuis le statut brut quand elle n'est pas encore définie.
function suiviDeStatut(statut: string): string {
  const s = (statut || "").toLowerCase();
  if (/honor/.test(s)) return "Honoré";
  if (/signe|actif|cours|valide/.test(s)) return s.includes("valide") ? "Validé" : "En cours";
  if (/refuse|annul|abandon|echou/.test(s)) return "Abandonné";
  return "En attente";
}

function ContratDetailBloc({ c }: { c: ContratDetail }) {
  const cree = dateFR(c.createdAt);
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-[12px] border border-border bg-surface-2 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={c.pole === "illegal" ? "oxblood" : "accent"}>{c.pole === "illegal" ? "🔪 Confrérie" : "⚖️ Iron Wolf"}</Badge>
        <Badge tone={SUIVI_TONE[c.suivi || suiviDeStatut(c.statut)] ?? "muted"}>{c.suivi || suiviDeStatut(c.statut)}</Badge>
        {c.remuneration ? <span className="ml-auto font-num text-[0.86rem] font-semibold" style={{ color: "var(--accent)" }}>{c.remuneration}</span> : null}
      </div>
      {c.remuVerseAuCoffre ? <div className="flex items-center gap-1.5 text-[0.8rem]" style={{ color: "var(--good)" }}><Landmark className="h-3.5 w-3.5" /> {cents(c.remuVerseAuCoffre)}$ versés au coffre</div> : null}
      <div className="text-[0.86rem] leading-relaxed text-ink">{c.cible}</div>
      {c.commanditaire ? <div className="text-[0.8rem] text-muted"><span className="text-faint">Commanditaire : </span>{c.commanditaire}</div> : null}
      {c.motif ? <div className="text-[0.82rem] leading-relaxed text-muted"><span className="text-faint">Détails / conditions : </span>{c.motif}</div> : null}
      {c.agentsNoms.length ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.05em] text-faint"><Users className="h-3.5 w-3.5" /> Agents ({c.agentsNoms.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {c.agentsNoms.map((n, i) => <span key={i} className="rounded-full border border-border bg-surface px-2 py-0.5 text-[0.76rem]">{n}</span>)}
          </div>
        </div>
      ) : null}
      {cree ? <div className="flex items-center gap-1.5 text-[0.78rem] text-muted"><CalendarClock className="h-3.5 w-3.5 text-faint" /> {cree}</div> : null}
    </div>
  );
}

type Router = ReturnType<typeof useRouter>;

const STATUTS = [
  { key: "en_attente", label: "En attente", tone: "var(--warn)" },
  { key: "valide", label: "Validé", tone: "var(--good)" },
  { key: "signe", label: "Signé", tone: "var(--good)" },
  { key: "termine", label: "Terminé", tone: "var(--muted)" },
  { key: "annule", label: "Annulé", tone: "var(--muted)" },
  { key: "refuse", label: "Refusé", tone: "var(--oxblood)" },
];
const POLES = [
  { key: "legal", label: "⚖️ Iron Wolf" },
  { key: "illegal", label: "🔪 La Confrérie" },
];
const STATUT_TONE: Record<string, "good" | "warn" | "muted" | "accent" | "oxblood"> = {
  en_attente: "warn", valide: "good", signe: "good", termine: "muted", annule: "muted", refuse: "oxblood",
};

export function ContratsTable({ contrats }: { contrats: ContratDetail[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<ContratDetail | null>(null);
  const [nouveau, setNouveau] = useState(false);

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Contrats</h3>
          <span className="font-num text-[0.8rem] text-faint">{contrats.length}</span>
        </div>
        <button onClick={() => setNouveau(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2">
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Nouveau contrat
        </button>
      </div>

      {contrats.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <FileText className="h-6 w-6 text-faint" strokeWidth={1.6} />
          <p className="max-w-md text-[0.82rem] leading-relaxed text-muted">Aucun contrat pour l&apos;instant. Crée-en un avec « Nouveau contrat ».</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[0.85rem]">
            <thead>
              <tr className="text-[0.7rem] uppercase tracking-[0.06em] text-faint">
                <th className="border-b border-border px-2.5 py-2 font-semibold">Objet</th>
                <th className="border-b border-border px-2.5 py-2 font-semibold">Commanditaire</th>
                <th className="border-b border-border px-2.5 py-2 font-semibold">Pôle</th>
                <th className="border-b border-border px-2.5 py-2 font-semibold">Rémunération</th>
                <th className="border-b border-border px-2.5 py-2 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody>
              {contrats.map((c) => (
                <tr key={c.id} onClick={() => setSel(c)} className="cursor-pointer hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                  <td className="border-b border-border px-2.5 py-2.5 font-medium">{c.cible}</td>
                  <td className="border-b border-border px-2.5 py-2.5 text-muted">{c.commanditaire || "—"}</td>
                  <td className="border-b border-border px-2.5 py-2.5"><Badge tone={c.pole === "illegal" ? "oxblood" : "accent"}>{c.pole === "illegal" ? "Confrérie" : "Iron Wolf"}</Badge></td>
                  <td className="border-b border-border px-2.5 py-2.5 font-num text-muted">{c.remuneration || "—"}</td>
                  <td className="border-b border-border px-2.5 py-2.5"><Badge tone={STATUT_TONE[c.statut?.toLowerCase()] ?? "muted"}>{c.statut}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[0.72rem] text-faint">Clique sur une ligne pour modifier le contrat.</p>
        </div>
      )}

      {sel ? <EditModal contrat={sel} onClose={() => setSel(null)} router={router} /> : null}
      {nouveau ? <NouveauModal onClose={() => setNouveau(false)} router={router} /> : null}
    </>
  );
}

function NouveauModal({ onClose, router }: { onClose: () => void; router: Router }) {
  const [cible, setCible] = useState("");
  const [commanditaire, setCommanditaire] = useState("");
  const [remuneration, setRemuneration] = useState("");
  const [statut, setStatut] = useState("en_attente");
  const [pole, setPole] = useState("legal");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function creer() {
    setErr(null);
    if (cible.trim().length < 2) { setErr("Donne un objet au contrat."); return; }
    setBusy(true);
    const r = await creerContrat({ cible, commanditaire, remuneration, statut, pole });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    setOk(true); router.refresh();
  }

  return (
    <Modal titre="📜 Nouveau contrat" onClose={onClose}>
      {ok ? (
        <div className="flex flex-col gap-3">
          <Flash>Contrat créé — il apparaîtra ici dans ~30 s.</Flash>
          <div className="flex justify-end"><button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button></div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Champ label="Objet *"><input className={inputCls} value={cible} onChange={(e) => setCible(e.target.value)} placeholder="Escorte d'un convoi de médicaments" maxLength={300} autoFocus /></Champ>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Commanditaire"><input className={inputCls} value={commanditaire} onChange={(e) => setCommanditaire(e.target.value)} placeholder="M. Ross" maxLength={200} /></Champ>
            <Champ label="Rémunération"><input className={inputCls} value={remuneration} onChange={(e) => setRemuneration(e.target.value)} placeholder="$1200" maxLength={120} /></Champ>
          </div>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Pôle</span><Picker options={POLES} value={pole} onChange={setPole} /></div>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut</span><Picker options={STATUTS} value={statut} onChange={setStatut} /></div>
          {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
          <div className="mt-1 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
            <button onClick={creer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" strokeWidth={2} />} Créer
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function EditModal({ contrat, onClose, router }: { contrat: ContratDetail; onClose: () => void; router: Router }) {
  const [cible, setCible] = useState(contrat.cible);
  const [commanditaire, setCommanditaire] = useState(contrat.commanditaire || "");
  const [remuneration, setRemuneration] = useState(contrat.remuneration || "");
  const [statut, setStatut] = useState((contrat.statut || "en_attente").toLowerCase());
  const [pole, setPole] = useState(contrat.pole === "illegal" ? "illegal" : "legal");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [suivi, setSuivi] = useState(contrat.suivi || suiviDeStatut(contrat.statut));
  const [honorer, setHonorer] = useState(false);
  const [montant, setMontant] = useState(String((contrat.remuneration || "").replace(/[^\d]/g, "") || ""));
  const dejaHonore = !!contrat.remuVerseAuCoffre;

  async function push(patch: Record<string, string>, key: string) {
    setBusy(key);
    const r = await majContrat(contrat.id, patch);
    setBusy(null);
    setFlash(r.ok ? "Enregistré — mise à jour dans ~30 s." : (r.error || "Échec."));
  }
  async function changerSuivi(stage: string) {
    if (stage === "Honoré") { setHonorer(true); return; }
    const prev = suivi; setSuivi(stage); setBusy("suivi");
    const r = await majSuiviContrat(contrat.id, stage);
    setBusy(null);
    if (!r.ok) { setSuivi(prev); setFlash(r.error || "Échec."); return; }
    setFlash(`Suivi → ${stage} — mise à jour dans ~30 s.`); router.refresh();
  }
  async function confirmerHonorer() {
    const m = Number(montant);
    if (!m || m <= 0) { setFlash("Indique un montant."); return; }
    setBusy("honorer");
    const r = await honorerContrat(contrat.id, m);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setSuivi("Honoré"); setHonorer(false);
    setFlash(`Contrat honoré : ${cents(m)}$ versés au coffre + facture créée.`); router.refresh();
  }
  async function supprimer() {
    setBusy("del");
    const r = await supprimerContrat(contrat.id);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    router.refresh(); onClose();
  }

  return (
    <Modal titre={contrat.cible} onClose={onClose}>
      {flash ? <div className="mb-3"><Flash>{flash}</Flash></div> : null}
      <ContratDetailBloc c={contrat} />

      {/* Suivi / pipeline */}
      <div className="mb-3 flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-[0.72rem] uppercase tracking-[0.06em] text-faint">Suivi {busy === "suivi" ? "· …" : ""}</span>
        <div className="flex flex-wrap gap-1.5">
          {SUIVI.map((s) => {
            const on = suivi === s;
            const tone = s === "Honoré" ? "var(--good)" : s === "Abandonné" ? "var(--muted)" : s === "Validé" ? "var(--good)" : s === "En cours" ? "var(--steel)" : "var(--warn)";
            return (
              <button key={s} onClick={() => changerSuivi(s)} disabled={dejaHonore && s !== "Honoré"} className="rounded-lg border px-2.5 py-1.5 text-[0.76rem] font-semibold transition disabled:opacity-40"
                style={{ color: on ? "#000" : tone, background: on ? tone : "transparent", borderColor: "color-mix(in srgb," + tone + " 45%,var(--border))" }}>
                {s}
              </button>
            );
          })}
        </div>
        {honorer && !dejaHonore ? (
          <div className="flex items-end gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[0.7rem] text-faint">Montant à verser au coffre ($)</span>
              <input className={inputCls} type="number" min={1} value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="1200" autoFocus />
            </label>
            <button onClick={confirmerHonorer} disabled={busy === "honorer"} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--good)" }}>
              {busy === "honorer" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />} Encaisser
            </button>
            <button onClick={() => setHonorer(false)} className="rounded-lg border border-border bg-surface px-2.5 py-2 text-[0.78rem] text-muted hover:text-ink">Annuler</button>
          </div>
        ) : null}
        {dejaHonore ? <p className="flex items-center gap-1.5 text-[0.78rem]" style={{ color: "var(--good)" }}><Check className="h-3.5 w-3.5" /> Contrat honoré — {cents(contrat.remuVerseAuCoffre || 0)}$ au coffre.</p> : null}
      </div>

      <div className="mb-2 border-t border-border pt-3 text-[0.72rem] uppercase tracking-[0.06em] text-faint">Modifier</div>
      <div className="flex flex-col gap-3">
        <Champ label="Objet"><input className={inputCls} value={cible} onChange={(e) => setCible(e.target.value)} maxLength={300} /></Champ>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Commanditaire"><input className={inputCls} value={commanditaire} onChange={(e) => setCommanditaire(e.target.value)} maxLength={200} /></Champ>
          <Champ label="Rémunération"><input className={inputCls} value={remuneration} onChange={(e) => setRemuneration(e.target.value)} maxLength={120} /></Champ>
        </div>
        <div className="flex justify-end">
          <button onClick={() => push({ cible, commanditaire, remuneration }, "save")} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[0.76rem] font-semibold hover:border-border-2 disabled:opacity-60">
            {busy === "save" ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Enregistrer
          </button>
        </div>
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Pôle</span>
          <Picker options={POLES} value={pole} onChange={(v) => { setPole(v); push({ pole: v }, "pole"); }} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut</span>
          <Picker options={STATUTS} value={statut} onChange={(v) => { setStatut(v); push({ statut: v }, "statut"); }} />
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
          {confirmDel ? (
            <div className="flex items-center gap-2 text-[0.78rem]">
              <span className="text-muted">Supprimer ?</span>
              <button onClick={supprimer} disabled={busy === "del"} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--oxblood)" }}>{busy === "del" ? "…" : "Oui"}</button>
              <button onClick={() => setConfirmDel(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
          )}
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button>
        </div>
      </div>
    </Modal>
  );
}
