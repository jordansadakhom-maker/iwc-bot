"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserPlus, Search, Loader2, Trash2, Check, X, Calendar, Clock, Award, IdCard, Target, AlertTriangle, Copy, Link2, MessageSquare } from "lucide-react";
import type { CandidatureItem } from "@/lib/queries";
import { Modal, Flash, inputCls } from "@/components/edit-ui";
import { Badge } from "@/components/ui";
import { majStatutCandidature, majNotesCandidature, supprimerCandidature } from "@/app/(app)/recrutement/actions";

type Router = ReturnType<typeof useRouter>;
const dateFR = (s: string | null) => { if (!s) return ""; try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
// Nombre de jours écoulés depuis une date (pour la relance des dossiers oubliés).
const joursDepuis = (s: string | null) => { if (!s) return null; try { const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000); return Number.isFinite(d) ? d : null; } catch { return null; } };
// Une candidature « nouveau » laissée +3 j sans traitement → à relancer.
const enAttente = (c: CandidatureItem) => { const j = joursDepuis(c.createdAt); return c.statut === "nouveau" && j != null && j >= 3 ? j : null; };

const STATUTS = [
  { key: "nouveau", label: "Nouveau", tone: "warn" as const },
  { key: "entretien", label: "Entretien", tone: "accent" as const },
  { key: "accepte", label: "Accepté", tone: "good" as const },
  { key: "refuse", label: "Refusé", tone: "oxblood" as const },
];
const stConf = (s: string) => STATUTS.find((x) => x.key === s) || STATUTS[0];

export function RecrutementPanel({ candidatures }: { candidatures: CandidatureItem[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<CandidatureItem | null>(null);
  const [filtre, setFiltre] = useState<string>("tous");
  const [q, setQ] = useState("");
  const params = useSearchParams();

  // Deep-link : ?focus=<id> (depuis une notification) ouvre directement la fiche.
  useEffect(() => {
    const id = params.get("focus");
    if (!id) return;
    const found = candidatures.find((c) => c.id === id);
    if (found) setSel(found);
  }, [params, candidatures]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { tous: candidatures.length };
    for (const s of STATUTS) m[s.key] = candidatures.filter((c) => c.statut === s.key).length;
    return m;
  }, [candidatures]);

  const filtres = candidatures
    .filter((c) => {
      if (filtre !== "tous" && c.statut !== filtre) return false;
      const t = q.trim().toLowerCase();
      if (!t) return true;
      return `${c.nomRP} ${c.motivation || ""} ${c.experience || ""} ${c.contact || ""}`.toLowerCase().includes(t);
    })
    // Les candidatures « Nouveau » (pas encore traitées) remontent en tête ;
    // le reste garde l'ordre du serveur (plus récentes d'abord).
    .sort((a, b) => Number(b.statut === "nouveau") - Number(a.statut === "nouveau"));

  return (
    <>
      {/* Filtres par statut */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Chip on={filtre === "tous"} onClick={() => setFiltre("tous")} label="Toutes" n={counts.tous} />
        {STATUTS.map((s) => <Chip key={s.key} on={filtre === s.key} onClick={() => setFiltre(s.key)} label={s.label} n={counts[s.key]} tone={s.tone} />)}
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un candidat…" />
      </div>

      {candidatures.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full border" style={{ borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))", background: "color-mix(in srgb,var(--accent) 8%,transparent)" }}>
            <UserPlus className="h-5 w-5" style={{ color: "color-mix(in srgb,var(--accent) 70%,var(--faint))" }} strokeWidth={1.6} />
          </span>
          <p className="max-w-md font-display text-[0.9rem] italic text-muted">Aucune candidature pour l&apos;instant. Les candidatures déposées sur la page publique <b>/rejoindre</b> arriveront ici, prêtes à être traitées.</p>
        </div>
      ) : filtres.length === 0 ? (
        <p className="px-4 py-10 text-center text-[0.85rem] text-faint">Aucune candidature dans ce filtre.</p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {filtres.map((c) => {
            const st = stConf(c.statut);
            const att = enAttente(c);
            return (
              <button key={c.id} onClick={() => setSel(c)} className="rounded-[12px] border border-border bg-surface-2 px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-border-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[0.9rem] font-semibold">{c.nomRP}{c.age ? <span className="ml-1 text-[0.74rem] font-normal text-faint">· {c.age}</span> : null}</span>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
                {(att != null || c.doublon) ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {att != null ? <MiniTag tone="warn"><Clock className="h-3 w-3" /> En attente {att} j</MiniTag> : null}
                    {c.doublon ? <MiniTag tone="oxblood"><AlertTriangle className="h-3 w-3" /> Doublon possible</MiniTag> : null}
                  </div>
                ) : null}
                <p className="mt-1.5 line-clamp-2 text-[0.76rem] text-muted">{c.motivation || "—"}</p>
                <div className="mt-2 flex items-center gap-2 text-[0.68rem] text-faint">
                  <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {dateFR(c.createdAt)}</span>
                  {c.contact ? <span className="truncate">· {c.moyen ? c.moyen + " : " : ""}{c.contact}</span> : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {sel ? <CandModal cand={sel} onClose={() => setSel(null)} router={router} /> : null}
    </>
  );
}

function MiniTag({ tone, children }: { tone: "warn" | "oxblood"; children: React.ReactNode }) {
  const col = tone === "oxblood" ? "var(--oxblood)" : "var(--warn)";
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.66rem] font-semibold" style={{ color: col, background: `color-mix(in srgb,${col} 14%,transparent)`, border: `1px solid color-mix(in srgb,${col} 30%,transparent)` }}>
      {children}
    </span>
  );
}

function Chip({ on, onClick, label, n, tone }: { on: boolean; onClick: () => void; label: string; n: number; tone?: "warn" | "accent" | "good" | "oxblood" }) {
  const col = tone === "good" ? "var(--good)" : tone === "accent" ? "var(--accent)" : tone === "oxblood" ? "var(--oxblood)" : tone === "warn" ? "var(--warn)" : "var(--accent)";
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.78rem] font-semibold transition" style={{ color: on ? "#000" : "var(--muted)", background: on ? col : "var(--surface-2)", border: "1px solid var(--border)" }}>
      {label} <span className="font-num opacity-70">{n}</span>
    </button>
  );
}

function CandModal({ cand, onClose, router }: { cand: CandidatureItem; onClose: () => void; router: Router }) {
  const [statut, setStatut] = useState(cand.statut);
  const [notes, setNotes] = useState(cand.notes || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [copie, setCopie] = useState<string | null>(null);

  async function copier(txt: string, key: string) {
    try { await navigator.clipboard.writeText(txt); setCopie(key); setTimeout(() => setCopie((k) => (k === key ? null : k)), 1800); }
    catch { setFlash("Copie impossible sur cet appareil."); }
  }
  // Modèles de réponse prêts à coller (recontact via le moyen de contact du candidat).
  function texteModele(kind: "entretien" | "accepte" | "refuse") {
    const nom = cand.nomRP;
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const lien = cand.ref ? `${base}/candidature/${cand.ref}` : "";
    if (kind === "entretien") return `Bonjour ${nom},\n\nTa candidature à la Iron Wolf Company a retenu notre attention. Serais-tu disponible pour un court entretien prochainement ?${lien ? `\n\nTu peux suivre ton dossier ici : ${lien}` : ""}\n\n— La Direction`;
    if (kind === "accepte") return `Bonjour ${nom},\n\nFélicitations : ta candidature est acceptée, bienvenue dans la meute ! 🐺 On revient très vite vers toi pour ton intégration.${lien ? `\n\nDétails et suite ici : ${lien}` : ""}\n\n— La Direction`;
    return `Bonjour ${nom},\n\nMerci pour ta candidature et pour l'intérêt porté à la Iron Wolf Company. Nous ne donnons pas suite cette fois-ci, mais la porte reste ouverte à l'avenir.${lien ? `\n\n${lien}` : ""}\n\n— La Direction`;
  }

  async function changerStatut(st: string) {
    setBusy("st"); const r = await majStatutCandidature(cand.id, st); setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setStatut(st); setFlash(`Statut : ${stConf(st).label}.`); router.refresh();
  }
  async function enregistrerNotes() {
    setBusy("notes"); const r = await majNotesCandidature(cand.id, notes); setBusy(null);
    setFlash(r.ok ? "Notes enregistrées." : (r.error || "Échec.")); if (r.ok) router.refresh();
  }
  async function supprimer() {
    setBusy("del"); const r = await supprimerCandidature(cand.id); setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; } router.refresh(); onClose();
  }

  const Ligne = ({ icon: Icon, titre, texte }: { icon: typeof Target; titre: string; texte: string | null }) => texte ? (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.05em] text-faint"><Icon className="h-3.5 w-3.5" /> {titre}</span>
      <p className="whitespace-pre-wrap text-[0.86rem] text-ink">{texte}</p>
    </div>
  ) : null;

  return (
    <Modal titre={`Candidature — ${cand.nomRP}`} onClose={onClose} max={560}>
      {flash ? <div className="mb-3"><Flash>{flash}</Flash></div> : null}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-[0.76rem] text-faint">
        <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {dateFR(cand.createdAt)}</span>
        {cand.age ? <span>· {cand.age}</span> : null}
        {cand.contact ? <span className="inline-flex items-center gap-1">· <IdCard className="h-3.5 w-3.5" /> {cand.moyen ? cand.moyen + " : " : ""}{cand.contact}</span> : null}
      </div>

      {cand.doublon ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border p-2.5 text-[0.78rem]" style={{ borderColor: "color-mix(in srgb,var(--oxblood) 35%,var(--border))", background: "color-mix(in srgb,var(--oxblood) 8%,transparent)" }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--oxblood)" }} />
          <span className="text-ink"><b>Doublon possible</b> — un même nom RP ou un même contact apparaît sur une autre candidature. À vérifier avant de traiter.</span>
        </div>
      ) : null}

      {cand.ref ? (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-faint" />
          <span className="text-[0.72rem] text-faint">Suivi candidat</span>
          <code className="ml-auto font-mono text-[0.8rem] text-ink">{cand.ref}</code>
          <button onClick={() => copier(`${typeof window !== "undefined" ? window.location.origin : ""}/candidature/${cand.ref}`, "lien")} className="grid h-7 w-7 place-items-center rounded-md border border-border bg-surface text-muted hover:text-ink" aria-label="Copier le lien de suivi">{copie === "lien" ? <Check className="h-3.5 w-3.5" style={{ color: "var(--good)" }} /> : <Copy className="h-3.5 w-3.5" />}</button>
        </div>
      ) : null}

      {/* Statut */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {STATUTS.map((s) => {
          const on = statut === s.key;
          const col = s.tone === "good" ? "var(--good)" : s.tone === "accent" ? "var(--accent)" : s.tone === "oxblood" ? "var(--oxblood)" : "var(--warn)";
          return <button key={s.key} onClick={() => changerStatut(s.key)} disabled={busy === "st"} className="rounded-lg px-2.5 py-1.5 text-[0.78rem] font-semibold transition disabled:opacity-60" style={{ color: on ? (s.tone === "oxblood" ? "#fff" : "#000") : "var(--muted)", background: on ? col : "var(--surface-2)", border: "1px solid var(--border)" }}>{s.label}</button>;
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface-2 p-3.5">
        <Ligne icon={Award} titre="Motivation" texte={cand.motivation} />
        <Ligne icon={Target} titre="Expérience" texte={cand.experience} />
        <Ligne icon={Clock} titre="Disponibilités" texte={cand.disponibilites} />
        <Ligne icon={MessageSquare} titre="Nous a connus via" texte={cand.source} />
      </div>

      {/* Notes internes */}
      <div className="mt-3 flex flex-col gap-1.5">
        <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Notes internes (équipe)</span>
        <textarea className={inputCls + " min-h-[60px] resize-y"} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Impressions, retour d'entretien, décision…" />
        <button onClick={enregistrerNotes} disabled={busy === "notes"} className="self-end inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[0.78rem] font-semibold hover:border-border-2 disabled:opacity-60">{busy === "notes" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Enregistrer les notes</button>
      </div>

      {/* Modèles de réponse — à copier puis coller dans le moyen de contact du candidat */}
      <div className="mt-3 flex flex-col gap-1.5">
        <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Modèles de réponse</span>
        <div className="flex flex-wrap gap-1.5">
          {([["entretien", "Convoquer en entretien"], ["accepte", "Réponse : accepté"], ["refuse", "Réponse : refusé"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => copier(texteModele(k), `m-${k}`)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold hover:border-border-2">
              {copie === `m-${k}` ? <Check className="h-3.5 w-3.5" style={{ color: "var(--good)" }} /> : <Copy className="h-3.5 w-3.5" />} {label}
            </button>
          ))}
        </div>
        <p className="text-[0.7rem] text-faint">Copie le message, puis colle-le dans {cand.moyen || "le moyen de contact"} du candidat.</p>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        {confirmDel ? (
          <div className="flex items-center gap-2 text-[0.78rem]"><span className="text-muted">Supprimer la candidature ?</span>
            <button onClick={supprimer} disabled={busy === "del"} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--oxblood)", color: "#fff" }}>{busy === "del" ? "…" : "Oui"}</button>
            <button onClick={() => setConfirmDel(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button></div>
        ) : <button onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>}
        <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><X className="h-3.5 w-3.5" /> Fermer</button>
      </div>
    </Modal>
  );
}
