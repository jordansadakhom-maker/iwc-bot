"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Crosshair, Plus, Loader2, Trash2, Pencil } from "lucide-react";
import type { RapportItem, TraqueItem } from "@/lib/queries";
import { Card, CardHeader, Empty, Badge } from "@/components/ui";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { creerRapport, majRapport, supprimerRapport, creerTraque, majTraque, supprimerTraque } from "@/app/(app)/renseignement/actions";

type Router = ReturnType<typeof useRouter>;

const STATUT_RAPPORT = [
  { key: "nouveau", label: "Nouveau", tone: "var(--warn)" },
  { key: "confirme", label: "Confirmé", tone: "var(--good)" },
  { key: "infirme", label: "Infirmé", tone: "var(--muted)" },
];
const STATUT_TRAQUE = [
  { key: "chasse", label: "En chasse", tone: "var(--oxblood)" },
  { key: "capturee", label: "Capturée", tone: "var(--good)" },
  { key: "eliminee", label: "Éliminée", tone: "var(--muted)" },
  { key: "abandonnee", label: "Abandonnée", tone: "var(--muted)" },
];
const DANGER = [
  { key: "faible", label: "Faible", tone: "var(--good)" },
  { key: "moyen", label: "Moyen", tone: "var(--warn)" },
  { key: "eleve", label: "Élevé", tone: "var(--oxblood)" },
  { key: "extreme", label: "Extrême", tone: "var(--oxblood)" },
];
const tone = (arr: { key: string; tone?: string }[], k: string) => arr.find((x) => x.key === (k || "").toLowerCase())?.tone;
const label = (arr: { key: string; label: string }[], k: string) => arr.find((x) => x.key === (k || "").toLowerCase())?.label || k;
const badgeTone = (t?: string): "good" | "warn" | "muted" | "oxblood" | "accent" =>
  t === "var(--good)" ? "good" : t === "var(--warn)" ? "warn" : t === "var(--oxblood)" ? "oxblood" : "muted";

function Fiabilite({ n }: { n: number }) {
  const v = Math.max(0, Math.min(5, Math.round(n)));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Fiabilité ${v}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="h-1.5 w-3 rounded-sm" style={{ background: i <= v ? "var(--accent)" : "color-mix(in srgb,var(--ink) 12%,transparent)" }} />
      ))}
    </span>
  );
}

function BtnAdd({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2">
      <Plus className="h-3.5 w-3.5" strokeWidth={2} /> {children}
    </button>
  );
}

const DANGER_RANK: Record<string, number> = { faible: 1, moyen: 2, eleve: 3, extreme: 4 };

export function RenseignementPanel({ rapports, traques }: { rapports: RapportItem[]; traques: TraqueItem[] }) {
  const router = useRouter();
  const [rapEdit, setRapEdit] = useState<RapportItem | null>(null);
  const [rapNew, setRapNew] = useState(false);
  const [traEdit, setTraEdit] = useState<TraqueItem | null>(null);
  const [traNew, setTraNew] = useState(false);

  // Renseignements FRAIS (non traités) en tête, puis les plus fiables d'abord.
  const rapportsTri = [...rapports].sort((a, b) => {
    const an = (a.statut || "").toLowerCase() === "nouveau" ? 1 : 0;
    const bn = (b.statut || "").toLowerCase() === "nouveau" ? 1 : 0;
    if (an !== bn) return bn - an;
    return (b.fiabilite || 0) - (a.fiabilite || 0);
  });
  // Cibles « En chasse » d'abord, puis les plus dangereuses en tête.
  const traquesTri = [...traques].sort((a, b) => {
    const ac = (a.statut || "").toLowerCase() === "chasse" ? 1 : 0;
    const bc = (b.statut || "").toLowerCase() === "chasse" ? 1 : 0;
    if (ac !== bc) return bc - ac;
    return (DANGER_RANK[(b.dangerosite || "").toLowerCase()] || 0) - (DANGER_RANK[(a.dangerosite || "").toLowerCase()] || 0);
  });

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
      <Card>
        <div className="mb-3.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Rapports d&apos;informateurs</h3>
            <span className="font-num text-[0.8rem] text-faint">{rapports.length}</span>
          </div>
          <BtnAdd onClick={() => setRapNew(true)}>Nouveau rapport</BtnAdd>
        </div>
        {rapports.length === 0 ? (
          <Empty icon={Eye}>Aucun rapport. Ajoute un renseignement avec « Nouveau rapport ».</Empty>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {rapportsTri.map((r) => (
              <div key={r.id} className="group py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[0.9rem] font-semibold">
                      {r.cible ? <>Cible : {r.cible}</> : "Renseignement"}
                      {r.source ? <span className="ml-2 text-[0.74rem] font-normal text-muted">source : {r.source}</span> : null}
                    </div>
                    <p className="mt-1 text-[0.82rem] leading-relaxed text-muted">{r.info}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={badgeTone(tone(STATUT_RAPPORT, r.statut))}>{label(STATUT_RAPPORT, r.statut)}</Badge>
                    <button onClick={() => setRapEdit(r)} className="opacity-60 transition hover:opacity-100" aria-label="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[0.72rem] text-faint"><span>Fiabilité</span> <Fiabilite n={r.fiabilite} /></div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Personnes traquées</h3>
            <span className="font-num text-[0.8rem] text-faint">{traques.length}</span>
          </div>
          <BtnAdd onClick={() => setTraNew(true)}>Nouvelle traque</BtnAdd>
        </div>
        {traques.length === 0 ? (
          <Empty icon={Crosshair}>Aucune traque active. Ajoute une cible avec « Nouvelle traque ».</Empty>
        ) : (
          <div className="flex flex-col gap-2.5">
            {traquesTri.map((t) => (
              <button key={t.id} onClick={() => setTraEdit(t)} className="rounded-[11px] border border-border bg-surface-2 px-3 py-2.5 text-left transition hover:border-border-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[0.88rem] font-semibold">{t.cible}</div>
                  <Badge tone={badgeTone(tone(STATUT_TRAQUE, t.statut))}>{label(STATUT_TRAQUE, t.statut)}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.72rem] text-muted">
                  {t.prime ? <span className="font-num rounded-md px-1.5 py-0.5" style={{ background: "color-mix(in srgb,var(--accent) 15%,transparent)", color: "var(--accent)" }}>Prime : {t.prime}</span> : null}
                  {t.dangerosite ? <span>Dangerosité : {label(DANGER, t.dangerosite)}</span> : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {rapNew ? <RapportModal onClose={() => setRapNew(false)} router={router} /> : null}
      {rapEdit ? <RapportModal rapport={rapEdit} onClose={() => setRapEdit(null)} router={router} /> : null}
      {traNew ? <TraqueModal onClose={() => setTraNew(false)} router={router} /> : null}
      {traEdit ? <TraqueModal traque={traEdit} onClose={() => setTraEdit(null)} router={router} /> : null}
    </div>
  );
}

function DelBar({ onDelete, onClose, busy }: { onDelete: () => void; onClose: () => void; busy: boolean }) {
  const [c, setC] = useState(false);
  return (
    <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
      {c ? (
        <div className="flex items-center gap-2 text-[0.78rem]">
          <span className="text-muted">Supprimer ?</span>
          <button onClick={onDelete} disabled={busy} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--oxblood)" }}>{busy ? "…" : "Oui"}</button>
          <button onClick={() => setC(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button>
        </div>
      ) : (
        <button onClick={() => setC(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
      )}
      <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button>
    </div>
  );
}

function RapportModal({ rapport, onClose, router }: { rapport?: RapportItem; onClose: () => void; router: Router }) {
  const editing = !!rapport;
  const [source, setSource] = useState(rapport?.source || "");
  const [cible, setCible] = useState(rapport?.cible || "");
  const [info, setInfo] = useState(rapport?.info || "");
  const [fiabilite, setFiabilite] = useState(String(rapport?.fiabilite ?? ""));
  const [statut, setStatut] = useState((rapport?.statut || "nouveau").toLowerCase());
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function valider() {
    if (info.trim().length < 2) { setFlash("Écris le renseignement."); return; }
    setBusy("save");
    const payload = { source, cible, info, fiabilite: fiabilite ? Number(fiabilite) : 0, statut };
    const r = editing ? await majRapport(rapport!.id, payload) : await creerRapport(payload);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setOk(true); router.refresh();
  }
  async function supprimer() {
    setBusy("del");
    const r = await supprimerRapport(rapport!.id);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    router.refresh(); onClose();
  }

  return (
    <Modal titre={editing ? "Modifier le rapport" : "🕵️ Nouveau rapport"} onClose={onClose}>
      {ok ? (
        <div className="flex flex-col gap-3"><Flash>Enregistré — mise à jour dans ~30 s.</Flash><div className="flex justify-end"><button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button></div></div>
      ) : (
        <div className="flex flex-col gap-3">
          {flash ? <Flash tone="bad">{flash}</Flash> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Source"><input className={inputCls} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Indic, informateur…" maxLength={200} /></Champ>
            <Champ label="Cible"><input className={inputCls} value={cible} onChange={(e) => setCible(e.target.value)} placeholder="Del Lobos…" maxLength={200} /></Champ>
          </div>
          <Champ label="Renseignement *"><textarea className={inputCls + " min-h-[80px] resize-y"} value={info} onChange={(e) => setInfo(e.target.value)} placeholder="Ce que la source rapporte…" maxLength={4000} autoFocus /></Champ>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Fiabilité</span>
            <Picker options={[1, 2, 3, 4, 5].map((n) => ({ key: String(n), label: "★".repeat(n) }))} value={fiabilite} onChange={setFiabilite} />
          </div>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut</span><Picker options={STATUT_RAPPORT} value={statut} onChange={setStatut} /></div>
          <div className="flex justify-end"><button onClick={valider} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {editing ? "Enregistrer" : "Ajouter"}</button></div>
          {editing ? <DelBar onDelete={supprimer} onClose={onClose} busy={busy === "del"} /> : null}
        </div>
      )}
    </Modal>
  );
}

function TraqueModal({ traque, onClose, router }: { traque?: TraqueItem; onClose: () => void; router: Router }) {
  const editing = !!traque;
  const [cible, setCible] = useState(traque?.cible || "");
  const [prime, setPrime] = useState(traque?.prime || "");
  const [dangerosite, setDangerosite] = useState((traque?.dangerosite || "").toLowerCase());
  const [statut, setStatut] = useState((traque?.statut || "chasse").toLowerCase());
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function valider() {
    if (cible.trim().length < 2) { setFlash("Indique la cible."); return; }
    setBusy("save");
    const payload = { cible, prime, dangerosite, statut };
    const r = editing ? await majTraque(traque!.id, payload) : await creerTraque(payload);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setOk(true); router.refresh();
  }
  async function supprimer() {
    setBusy("del");
    const r = await supprimerTraque(traque!.id);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    router.refresh(); onClose();
  }

  return (
    <Modal titre={editing ? "Modifier la traque" : "🎯 Nouvelle traque"} onClose={onClose}>
      {ok ? (
        <div className="flex flex-col gap-3"><Flash>Enregistré — mise à jour dans ~30 s.</Flash><div className="flex justify-end"><button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button></div></div>
      ) : (
        <div className="flex flex-col gap-3">
          {flash ? <Flash tone="bad">{flash}</Flash> : null}
          <Champ label="Cible *"><input className={inputCls} value={cible} onChange={(e) => setCible(e.target.value)} placeholder="Nom de la personne traquée" maxLength={200} autoFocus /></Champ>
          <Champ label="Prime"><input className={inputCls} value={prime} onChange={(e) => setPrime(e.target.value)} placeholder="$500" maxLength={120} /></Champ>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Dangerosité</span><Picker options={DANGER} value={dangerosite} onChange={setDangerosite} /></div>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut</span><Picker options={STATUT_TRAQUE} value={statut} onChange={setStatut} /></div>
          <div className="flex justify-end"><button onClick={valider} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {editing ? "Enregistrer" : "Ajouter"}</button></div>
          {editing ? <DelBar onDelete={supprimer} onClose={onClose} busy={busy === "del"} /> : null}
        </div>
      )}
    </Modal>
  );
}
