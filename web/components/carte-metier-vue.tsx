"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gauge, Shield, GraduationCap, Cross, Crosshair, Target, Users, UserPlus, Loader2, Check, X, ShieldCheck, type LucideIcon } from "lucide-react";
import { Card, CardHeader, Badge } from "@/components/ui";
import { Modal, Flash } from "@/components/edit-ui";
import type { Cartographie, MetierStat, MembrePuce, Couverture } from "@/lib/carte-metier";
import type { MembreAssign } from "@/lib/carte-metier-data";
import { assignerMetierCarte, changerGradeMembre } from "@/app/(app)/membres/actions";
import { GRADES_LEGAL, GRADES_ILLEGAL } from "@/lib/grades";

type MetierAssignable = "medecine" | "instruction";
const ICONE: Record<string, LucideIcon> = {
  direction: Gauge, officier: Shield, instruction: GraduationCap, medecine: Cross, armurerie: Crosshair, terrain: Target,
};
const COUV: Record<Couverture, { label: string; tone: "good" | "warn" | "oxblood"; c: string }> = {
  ok: { label: "Couvert", tone: "good", c: "var(--good)" },
  fragile: { label: "Personne de présent", tone: "warn", c: "var(--warn)" },
  vide: { label: "Non couvert", tone: "oxblood", c: "var(--oxblood)" },
};
// Fonctions éditables depuis le site (les autres dépendent du grade Discord).
const ASSIGNABLE: Partial<Record<string, { metier: MetierAssignable; verbe: string }>> = {
  medecine: { metier: "medecine", verbe: "l'habilitation médecin" },
  instruction: { metier: "instruction", verbe: "la fonction d'instructeur" },
};

function Puce({ m }: { m: MembrePuce }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[0.76rem]" style={m.absent ? { opacity: 0.6 } : undefined}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.absent ? "var(--muted)" : "var(--good)" }} />
      <span className={m.absent ? "text-muted line-through" : "text-ink"}>{m.nom}</span>
      {m.grade ? <span className="text-faint">· {m.grade}</span> : null}
    </span>
  );
}

function CarteMetier({ s, peutAssigner, onAssigner }: { s: MetierStat; peutAssigner: boolean; onAssigner?: () => void }) {
  const Ic = ICONE[s.key] || Users;
  const cv = COUV[s.couverture];
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ color: cv.c, background: "color-mix(in srgb," + cv.c + " 14%,transparent)" }}>
          <Ic className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><span className="font-display text-lg">{s.label}</span><Badge tone={cv.tone}>{cv.label}</Badge></div>
          <div className="text-[0.76rem] text-muted">{s.description}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-num text-[1.25rem] font-bold leading-none">{s.presents}<span className="text-[0.8rem] font-normal text-faint">/{s.total}</span></div>
          <div className="text-[0.66rem] text-faint">présents</div>
        </div>
      </div>
      {s.membres.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-border px-3 py-2.5 text-[0.78rem] italic text-faint">Aucun membre sur cette fonction — à pourvoir.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">{s.membres.map((m) => <Puce key={m.nom} m={m} />)}</div>
      )}
      {peutAssigner && onAssigner ? (
        <button onClick={onAssigner} className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2">
          <UserPlus className="h-3.5 w-3.5" /> Assigner des membres
        </button>
      ) : null}
    </Card>
  );
}

export function CarteMetierVue({ carto, membres, peut }: { carto: Cartographie; membres: MembreAssign[]; peut: { direction: boolean; officier: boolean } }) {
  const [assign, setAssign] = useState<MetierAssignable | null>(null);
  const [gradeOpen, setGradeOpen] = useState(false);
  const lacunes = carto.metiers.filter((m) => m.couverture !== "ok");
  const peutFor = (metier: MetierAssignable) => (metier === "medecine" ? peut.direction : peut.officier);

  return (
    <div className="flex flex-col gap-4">
      {peut.direction ? (
        <div className="flex justify-end">
          <button onClick={() => setGradeOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[0.8rem] font-semibold transition hover:brightness-110" style={{ color: "var(--accent)", borderColor: "color-mix(in srgb,var(--accent) 45%,var(--border))", background: "color-mix(in srgb,var(--accent) 10%,transparent)" }}>
            <ShieldCheck className="h-4 w-4" /> Gérer les grades
          </button>
        </div>
      ) : null}
      {lacunes.length > 0 ? (
        <div className="rounded-card border border-border bg-surface p-3.5 text-[0.85rem] shadow-card" style={{ borderColor: "color-mix(in srgb,var(--warn) 35%,var(--border))" }}>
          <b>À surveiller :</b>{" "}
          <span className="text-muted">{lacunes.map((m) => `${m.label} (${m.couverture === "vide" ? "non couvert" : "aucun présent"})`).join(" · ")}.</span>
        </div>
      ) : (
        <div className="rounded-card border border-border bg-surface p-3.5 text-[0.85rem] shadow-card" style={{ borderColor: "color-mix(in srgb,var(--good) 35%,var(--border))" }}>
          <b>Toutes les fonctions sont couvertes.</b> <span className="text-muted">Chaque métier compte au moins un membre présent. 🐺</span>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {carto.metiers.map((s) => {
          const a = ASSIGNABLE[s.key];
          const peutAssigner = !!a && peutFor(a.metier);
          return <CarteMetier key={s.key} s={s} peutAssigner={peutAssigner} onAssigner={a ? () => setAssign(a.metier) : undefined} />;
        })}
      </div>

      {carto.nonClasses.length > 0 ? (
        <Card>
          <CardHeader titre="Sans métier identifié" compteur={carto.nonClasses.length} />
          <p className="mb-2.5 text-[0.78rem] text-muted">Ces membres n&apos;ont pas de fonction déductible de leur grade ou de leur fiche RH. Complète leur fiche pour les rattacher à un métier.</p>
          <div className="flex flex-wrap gap-1.5">{carto.nonClasses.map((m) => <Puce key={m.nom} m={m} />)}</div>
        </Card>
      ) : null}

      {/* Note : Direction / Officiers / Terrain viennent du grade Discord — non modifiables ici. */}
      <p className="text-[0.74rem] text-faint">
        💡 <b>Médecine</b> et <b>Instruction</b> s&apos;attribuent ici. <b>Direction</b>, <b>Officiers</b> et <b>Terrain</b> découlent du <b>grade Discord</b> ; l&apos;<b>Armurerie</b> se gère depuis son module (roster).
      </p>

      {assign ? <AssignModal metier={assign} membres={membres} onClose={() => setAssign(null)} /> : null}
      {gradeOpen ? <GradeModal membres={membres} onClose={() => setGradeOpen(false)} /> : null}
    </div>
  );
}

function GradeModal({ membres, onClose }: { membres: MembreAssign[]; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ t: "ok" | "bad"; m: string } | null>(null);
  const [q, setQ] = useState("");
  const [grades, setGrades] = useState<Record<string, string>>({}); // id → grade choisi (optimiste)
  const query = q.trim().toLowerCase();
  const liste = membres.filter((m) => !query || m.nom.toLowerCase().includes(query) || (m.grade || "").toLowerCase().includes(query));

  async function appliquer(m: MembreAssign, grade: string) {
    if (!grade || grade === (grades[m.id] ?? m.grade)) return;
    setBusy(m.id);
    setGrades((g) => ({ ...g, [m.id]: grade }));
    const r = await changerGradeMembre(m.id, grade);
    setBusy(null);
    if (!r.ok) {
      setGrades((g) => ({ ...g, [m.id]: m.grade || "" }));
      setFlash({ t: "bad", m: r.error || "Changement impossible." });
    } else if (r.enAttente) {
      setFlash({ t: "ok", m: "Envoyé au bot — le grade sera appliqué dans un instant." });
    } else {
      setFlash({ t: "ok", m: r.message || `${m.nom} → ${grade}.` });
      router.refresh();
    }
  }

  return (
    <Modal titre="🛡️ Gérer les grades" onClose={onClose} max={560}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.8rem] text-muted">Change le grade Discord d&apos;un membre. Le bot applique le rôle et confirme. <b>Réservé à la Direction.</b> Le bot doit avoir « Gérer les rôles » et son rôle au-dessus des grades visés.</p>
        {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un membre…" className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.85rem] outline-none focus:border-border-2" />
        <div className="flex max-h-[48vh] flex-col gap-1 overflow-y-auto pr-1">
          {liste.length === 0 ? <p className="px-1 py-6 text-center text-[0.82rem] text-faint">Aucun membre.</p> : liste.map((m) => {
            const gradeActuel = grades[m.id] ?? m.grade ?? "";
            return (
              <div key={m.id} className="flex items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.85rem] font-medium">{m.nom}</div>
                  <div className="truncate text-[0.7rem] text-faint">{m.grade || "— sans grade —"}</div>
                </div>
                {busy === m.id ? <Loader2 className="h-4 w-4 animate-spin text-faint" /> : null}
                <select
                  value={gradeActuel} disabled={busy === m.id}
                  onChange={(e) => appliquer(m, e.target.value)}
                  className="max-w-[210px] rounded-lg border border-border bg-surface px-2 py-1.5 text-[0.8rem] outline-none focus:border-border-2 disabled:opacity-50"
                >
                  <option value="">— choisir un grade —</option>
                  <optgroup label="Iron Wolf">
                    {GRADES_LEGAL.map((g) => <option key={g.nom} value={g.nom}>{g.emoji} {g.nom}</option>)}
                  </optgroup>
                  <optgroup label="La Confrérie">
                    {GRADES_ILLEGAL.map((g) => <option key={g.nom} value={g.nom}>{g.emoji} {g.nom}</option>)}
                  </optgroup>
                </select>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end"><button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Fermer</button></div>
      </div>
    </Modal>
  );
}

function AssignModal({ metier, membres, onClose }: { metier: MetierAssignable; membres: MembreAssign[]; onClose: () => void }) {
  const router = useRouter();
  const [local, setLocal] = useState<MembreAssign[]>(membres);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ t: "ok" | "bad"; m: string } | null>(null);
  const [q, setQ] = useState("");

  const estDans = (m: MembreAssign) => (metier === "medecine" ? m.medecin : m.instructeur);
  const titre = metier === "medecine" ? "Cross Médecine — habilitation médecin" : "Instruction — instructeurs";
  const query = q.trim().toLowerCase();
  const liste = local.filter((m) => !query || m.nom.toLowerCase().includes(query) || (m.grade || "").toLowerCase().includes(query));
  // Les membres DANS la fonction d'abord.
  liste.sort((a, b) => Number(estDans(b)) - Number(estDans(a)) || a.nom.localeCompare(b.nom));

  async function bascule(m: MembreAssign) {
    const actif = !estDans(m);
    setBusy(m.id);
    setLocal((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...(metier === "medecine" ? { medecin: actif } : { instructeur: actif }) } : x)));
    const r = await assignerMetierCarte(m.id, metier, actif);
    setBusy(null);
    if (!r.ok) {
      setLocal((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...(metier === "medecine" ? { medecin: !actif } : { instructeur: !actif }) } : x)));
      setFlash({ t: "bad", m: r.error || "Impossible." });
    } else {
      setFlash({ t: "ok", m: `${m.nom} ${actif ? "assigné(e) à" : "retiré(e) de"} ${metier === "medecine" ? "la Médecine" : "l'Instruction"}.` });
      router.refresh();
    }
  }

  return (
    <Modal titre={metier === "medecine" ? "✚ Médecine — habilitation médecin" : "🎓 Instruction — instructeurs"} onClose={onClose} max={520}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.8rem] text-muted">
          {metier === "medecine"
            ? "Coche les membres habilités « médecin » (ouvre l'onglet Médical). Réservé à la Direction."
            : "Coche les membres qui assurent l'Instruction (spécialité « Instructeur »)."}
        </p>
        {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un membre…" className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.85rem] outline-none focus:border-border-2" />
        <div className="flex max-h-[46vh] flex-col gap-1 overflow-y-auto pr-1">
          {liste.length === 0 ? <p className="px-1 py-6 text-center text-[0.82rem] text-faint">Aucun membre.</p> : liste.map((m) => {
            const dans = estDans(m);
            return (
              <div key={m.id} className="flex items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dans ? "var(--good)" : "var(--faint)" }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.85rem] font-medium">{m.nom}</div>
                  {m.grade ? <div className="truncate text-[0.7rem] text-faint">{m.grade}</div> : null}
                </div>
                <button
                  onClick={() => bascule(m)} disabled={busy === m.id}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold transition disabled:opacity-50"
                  style={dans ? { border: "1px solid color-mix(in srgb,var(--oxblood) 40%,var(--border))", color: "var(--oxblood)" } : { background: "var(--accent)", color: "#000" }}
                >
                  {busy === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : dans ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                  {dans ? "Retirer" : "Assigner"}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end"><button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Fermer</button></div>
      </div>
    </Modal>
  );
}
