"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Moon, CalendarClock, Loader2, Plus, Check, UserCheck, CalendarPlus } from "lucide-react";
import type { AbsencesData, MembreAbsence } from "@/lib/queries";
import { Card, CardHeader, Empty, Badge } from "@/components/ui";
import { Modal, Flash, Champ, inputCls } from "@/components/edit-ui";
import { declarerAbsence, leverAbsence } from "@/app/(app)/absences/actions";

const dateFR = (s: string | null) => {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" }); } catch { return "—"; }
};
function joursRestants(s: string | null): string {
  if (!s) return "";
  try {
    const j = Math.ceil((new Date(s).getTime() - Date.now()) / 86400000);
    if (Number.isNaN(j)) return "";
    if (j <= 0) return "aujourd'hui";
    if (j === 1) return "demain";
    return `dans ${j} j`;
  } catch { return ""; }
}

function LigneAbsent({ m, onRetour, busy }: { m: MembreAbsence; onRetour: (m: MembreAbsence) => void; busy: boolean }) {
  const jr = joursRestants(m.absence?.jusqu ?? null);
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ color: "var(--warn)", background: "color-mix(in srgb,var(--warn) 15%,transparent)" }}>
        <Moon className="h-[17px] w-[17px]" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.9rem] font-semibold">{m.nom}</span>
          {m.grade ? <span className="text-[0.72rem] text-faint">· {m.grade}</span> : null}
          {m.pole === "illegal" ? <Badge tone="oxblood">Confrérie</Badge> : null}
          {jr === "aujourd'hui" || jr === "demain" ? <Badge tone="warn">Retour {jr}</Badge> : null}
        </div>
        <div className="mt-1 text-[0.78rem] text-muted">
          {m.absence?.jusqu ? (
            <>Retour <b className="text-ink">{dateFR(m.absence.jusqu)}</b>{jr ? <span className={jr === "aujourd'hui" || jr === "demain" ? "font-semibold" : "text-faint"} style={jr === "aujourd'hui" || jr === "demain" ? { color: "var(--warn)" } : undefined}> · {jr}</span> : null}</>
          ) : (
            <span className="text-faint">Retour indéterminé</span>
          )}
        </div>
        {m.absence?.raison ? <div className="mt-0.5 text-[0.76rem] italic text-faint">« {m.absence.raison} »</div> : null}
      </div>
      <button
        onClick={() => onRetour(m)} disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted transition hover:border-[color-mix(in_srgb,var(--good)_55%,var(--border))] hover:text-ink disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />} De retour
      </button>
    </div>
  );
}

export function AbsencesManager({ data }: { data: AbsencesData }) {
  const router = useRouter();
  const { absents, programmees, tous } = data;
  // Les retours les plus proches d'abord (retour indéterminé en dernier).
  const absentsTri = [...absents].sort((a, b) => {
    const ta = a.absence?.jusqu ? new Date(a.absence.jusqu).getTime() : Infinity;
    const tb = b.absence?.jusqu ? new Date(b.absence.jusqu).getTime() : Infinity;
    return ta - tb;
  });
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ t: "good" | "bad"; m: string } | null>(null);

  // Formulaire de déclaration
  const [membreId, setMembreId] = useState("");
  const [programmee, setProgrammee] = useState(false);
  const [debut, setDebut] = useState("");
  const [jusqu, setJusqu] = useState("");
  const [raison, setRaison] = useState("");
  const [saving, setSaving] = useState(false);

  function resetForm() { setMembreId(""); setProgrammee(false); setDebut(""); setJusqu(""); setRaison(""); }

  async function soumettre() {
    if (!membreId) { setFlash({ t: "bad", m: "Choisis le membre concerné." }); return; }
    setSaving(true); setFlash(null);
    const res = await declarerAbsence({
      membreId,
      debut: programmee && debut ? new Date(debut).toISOString() : undefined,
      jusqu: jusqu ? new Date(jusqu).toISOString() : undefined,
      raison,
    });
    setSaving(false);
    if (res.ok) {
      setFlash(null); setOpen(false); resetForm();
      router.refresh();
    } else {
      setFlash({ t: "bad", m: res.error || "Échec de l'enregistrement." });
    }
  }

  async function retour(m: MembreAbsence) {
    setBusyId(m.id); setFlash(null);
    const res = await leverAbsence(m.id);
    setBusyId(null);
    if (res.ok) { setFlash({ t: "good", m: `${m.nom} est de retour.` }); router.refresh(); }
    else setFlash({ t: "bad", m: res.error || "Échec." });
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-end">
        <button
          onClick={() => { resetForm(); setFlash(null); setOpen(true); }}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[0.85rem] font-semibold text-black/85"
          style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}
        >
          <Plus className="h-4 w-4" /> Déclarer une absence
        </button>
      </div>

      {flash && !open ? <div className="mb-4"><Flash tone={flash.t}>{flash.m}</Flash></div> : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader titre="Absents actuellement" compteur={absents.length} />
          {absents.length === 0 ? (
            <Empty icon={Check}>Toute la troupe est sur le pont. 🐺</Empty>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {absentsTri.map((m) => <LigneAbsent key={m.id} m={m} onRetour={retour} busy={busyId === m.id} />)}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader titre="Absences à venir" compteur={programmees.length} />
          {programmees.length === 0 ? (
            <Empty icon={CalendarClock}>Aucune absence programmée.</Empty>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {programmees.map((m) => (
                <div key={m.id} className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ color: "var(--steel)", background: "color-mix(in srgb,var(--steel) 15%,transparent)" }}>
                    <CalendarPlus className="h-[17px] w-[17px]" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.9rem] font-semibold">{m.nom}</div>
                    <div className="mt-1 text-[0.78rem] text-muted">
                      Du <b className="text-ink">{dateFR(m.absence?.programmee?.debut ?? null)}</b>
                      {m.absence?.programmee?.fin ? <> au <b className="text-ink">{dateFR(m.absence.programmee.fin)}</b></> : null}
                    </div>
                    {m.absence?.programmee?.raison ? <div className="mt-0.5 text-[0.76rem] italic text-faint">« {m.absence.programmee.raison} »</div> : null}
                  </div>
                  <button
                    onClick={() => retour(m)} disabled={busyId === m.id}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted transition hover:border-border-2 hover:text-ink disabled:opacity-50"
                  >
                    {busyId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Annuler
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {open ? (
        <Modal titre="Déclarer une absence" onClose={() => setOpen(false)} max={480}>
          <div className="flex flex-col gap-3.5">
            {flash ? <Flash tone={flash.t}>{flash.m}</Flash> : null}
            <Champ label="Membre concerné">
              <select className={inputCls} value={membreId} onChange={(e) => setMembreId(e.target.value)}>
                <option value="">— Choisir un membre —</option>
                {tous.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
            </Champ>

            <label className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[0.82rem]">
              <input type="checkbox" checked={programmee} onChange={(e) => setProgrammee(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              <span>Absence <b>programmée</b> (à une date future)</span>
            </label>

            {programmee ? (
              <Champ label="Début de l'absence">
                <input type="date" className={inputCls} value={debut} onChange={(e) => setDebut(e.target.value)} />
              </Champ>
            ) : null}

            <Champ label={programmee ? "Retour prévu (optionnel)" : "Date de retour (optionnel)"}>
              <input type="date" className={inputCls} value={jusqu} onChange={(e) => setJusqu(e.target.value)} />
            </Champ>

            <Champ label="Raison (optionnel)">
              <input className={inputCls} value={raison} onChange={(e) => setRaison(e.target.value)} placeholder="Vacances, travail, IRL…" maxLength={200} />
            </Champ>

            <div className="mt-1 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-xl border border-border px-4 py-2.5 text-[0.85rem] font-semibold text-muted hover:text-ink">Annuler</button>
              <button
                onClick={soumettre} disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[0.85rem] font-semibold text-black/85 disabled:opacity-60"
                style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Moon className="h-4 w-4" />} Enregistrer
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
