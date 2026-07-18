"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, UserPlus, Loader2, Check } from "lucide-react";
import { ajouterContact, type ContactInput } from "@/app/(app)/agenda/actions";

const AFFILIATIONS = ["Civil", "Loi", "Hors-la-loi", "Loups de Fer", "Cartel", "Autre"];
const RELATIONS = ["Amicale", "Professionnelle", "Affaire", "Tendue", "Hostile"];
const STATUTS = ["Vivant", "Disparu", "Recherché", "Décédé"];

const inputCls =
  "w-full rounded-[9px] border border-border bg-surface-2 px-3 py-2 text-[0.86rem] text-ink outline-none placeholder:text-faint focus:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]";

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">{label}</span>
      {children}
    </label>
  );
}

export function ContactNouveau() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<ContactInput>({ nom: "" });

  function reset() {
    setF({ nom: "" });
    setErr(null);
    setDone(false);
    setBusy(false);
  }
  function fermer() {
    setOpen(false);
    reset();
  }

  async function envoyer() {
    setErr(null);
    if ((f.nom || "").trim().length < 2) {
      setErr("Le nom est obligatoire.");
      return;
    }
    setBusy(true);
    const r = await ajouterContact(f);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error || "Envoi impossible.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  const set = (k: keyof ContactInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2"
      >
        <UserPlus className="h-3.5 w-3.5" strokeWidth={1.8} /> Nouveau contact
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={fermer}>
          <div
            className="max-h-[88vh] w-full max-w-[520px] overflow-y-auto rounded-card border border-border bg-surface p-5 shadow-card"
            style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-xl">🎴 Nouvelle fiche de contact</div>
                <div className="mt-1 text-[0.78rem] text-muted">Même format que sur Discord — la fiche sera créée dans le carnet et le forum.</div>
              </div>
              <button onClick={fermer} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted hover:text-ink" aria-label="Fermer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {done ? (
              <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-full" style={{ background: "color-mix(in srgb,var(--good) 18%,transparent)", color: "var(--good)" }}>
                  <Check className="h-6 w-6" />
                </span>
                <p className="text-[0.9rem] font-semibold">Fiche envoyée !</p>
                <p className="max-w-sm text-[0.82rem] leading-relaxed text-muted">
                  <b>{f.nom}</b> sera ajouté au carnet et publié sur le forum Discord dans une minute ou deux, puis apparaîtra ici.
                </p>
                <div className="mt-1 flex gap-2">
                  <button onClick={reset} className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[0.8rem] font-semibold hover:border-border-2">Ajouter un autre</button>
                  <button onClick={fermer} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Champ label="Nom & surnom *">
                  <input className={inputCls} value={f.nom} onChange={set("nom")} placeholder="Cole Bradford « Le Coyote »" maxLength={80} autoFocus />
                </Champ>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Champ label="Télégramme">
                    <input className={inputCls} value={f.telegramme || ""} onChange={set("telegramme")} placeholder="00000" maxLength={60} />
                  </Champ>
                  <Champ label="Métier">
                    <input className={inputCls} value={f.metier || ""} onChange={set("metier")} placeholder="Forgeron, contrebandier…" maxLength={60} />
                  </Champ>
                </div>

                <Champ label="Secteur / lieu">
                  <input className={inputCls} value={f.secteur || ""} onChange={set("secteur")} placeholder="Armadillo, Tumbleweed, Rio Bravo…" maxLength={60} />
                </Champ>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Champ label="Affiliation">
                    <select className={inputCls} value={f.affiliation || ""} onChange={set("affiliation")}>
                      <option value="">—</option>
                      {AFFILIATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </Champ>
                  <Champ label="Relation">
                    <select className={inputCls} value={f.relation || ""} onChange={set("relation")}>
                      <option value="">—</option>
                      {RELATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </Champ>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Champ label="Fiabilité">
                    <select className={inputCls} value={f.fiabilite ?? ""} onChange={(e) => setF((p) => ({ ...p, fiabilite: e.target.value ? Number(e.target.value) : undefined }))}>
                      <option value="">—</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"⭐".repeat(n)}</option>)}
                    </select>
                  </Champ>
                  <Champ label="Statut">
                    <select className={inputCls} value={f.statutRP || ""} onChange={set("statutRP")}>
                      <option value="">—</option>
                      {STATUTS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </Champ>
                </div>

                <Champ label="Notes">
                  <textarea className={inputCls + " min-h-[80px] resize-y"} value={f.notes || ""} onChange={set("notes")} placeholder="Où on l'a croisé, ce qu'il peut fournir, prudences…" maxLength={500} />
                </Champ>

                {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}

                <div className="mt-1 flex justify-end gap-2">
                  <button onClick={fermer} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
                  <button
                    onClick={envoyer}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60"
                    style={{ background: "var(--accent)" }}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />}
                    {busy ? "Envoi…" : "Créer la fiche"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
