"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, Send, Loader2, ArrowDownRight, ArrowUpRight, Landmark, Plus, Minus } from "lucide-react";
import type { Portefeuille, Transaction, MembreLite } from "@/lib/queries";
import { Modal, Flash, Champ, inputCls } from "@/components/edit-ui";
import { payerMembre, ajusterArgent } from "@/app/(app)/finances/actions";

type Router = ReturnType<typeof useRouter>;
import { cents } from "@/lib/format";
const money = (n: number) => `${cents(n)}$`;
const dateFR = (s: string | null) => { if (!s) return ""; try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

export function Portefeuilles({ portefeuilles, transactions, membres, total }: { portefeuilles: Portefeuille[]; transactions: Transaction[]; membres: MembreLite[]; total: number }) {
  const router = useRouter();
  const [payer, setPayer] = useState(false);
  const [ajuster, setAjuster] = useState(false);
  const [sensF, setSensF] = useState(""); // "" = tout | "entree" | "sortie"

  const estEntree = (t: Transaction) => /entr/i.test(t.sens);
  const txFiltrees = sensF ? transactions.filter((t) => (sensF === "entree" ? estEntree(t) : !estEntree(t))) : transactions;
  const visibles = txFiltrees.slice(0, 12);
  const net = visibles.reduce((s, t) => s + (estEntree(t) ? Math.abs(t.montant) : -Math.abs(t.montant)), 0);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Portefeuilles RP</h3>
          <span className="font-num text-[0.8rem] text-faint">{money(total)} en circulation</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPayer(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2"><Send className="h-3.5 w-3.5" /> Payer</button>
          <button onClick={() => setAjuster(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2"><Landmark className="h-3.5 w-3.5" /> Créditer / débiter</button>
        </div>
      </div>

      {portefeuilles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <Wallet className="h-6 w-6 text-faint" strokeWidth={1.6} />
          <p className="max-w-md text-[0.82rem] text-muted">Aucun portefeuille synchronisé pour l&apos;instant. Les soldes RP des membres apparaîtront ici.</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {portefeuilles.map((w) => (
            <div key={w.id} className="rounded-[11px] border border-border bg-surface-2 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[0.86rem] font-medium">{w.nom}</span>
                <span className="font-num text-[0.9rem] font-semibold" style={{ color: "var(--accent)" }}>{money(w.solde)}</span>
              </div>
              {w.historique.length ? (
                <div className="mt-1.5 flex flex-col gap-0.5 border-t border-border pt-1.5">
                  {w.historique.slice(0, 3).map((h, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-[0.7rem] text-faint">
                      <span className="min-w-0 truncate">{h.raison}</span>
                      <span className="shrink-0 font-num" style={{ color: (h.montant || 0) < 0 ? "var(--oxblood)" : "var(--good)" }}>{(h.montant || 0) > 0 ? "+" : ""}{h.montant}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {transactions.length ? (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[0.72rem] uppercase tracking-[0.06em] text-faint">Journal de trésorerie du coffre</span>
            <div className="flex items-center gap-1">
              {([["", "Tout"], ["entree", "Entrées"], ["sortie", "Sorties"]] as [string, string][]).map(([k, l]) => {
                const on = sensF === k;
                const col = k === "entree" ? "var(--good)" : k === "sortie" ? "var(--oxblood)" : "var(--accent)";
                return (
                  <button key={k || "tout"} onClick={() => setSensF(k)} aria-pressed={on}
                    className="rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold transition"
                    style={on ? { borderColor: `color-mix(in srgb,${col} 55%,var(--border))`, background: `color-mix(in srgb,${col} 16%,transparent)`, color: "var(--ink)" } : { borderColor: "var(--border)", color: "var(--muted)" }}>
                    {l}
                  </button>
                );
              })}
            </div>
            <span className="ml-auto text-[0.72rem] text-faint">Net affiché : <span className="font-num font-semibold" style={{ color: net < 0 ? "var(--oxblood)" : "var(--good)" }}>{net > 0 ? "+" : net < 0 ? "−" : ""}{money(Math.abs(net))}</span></span>
          </div>
          {visibles.length === 0 ? (
            <p className="px-1 py-4 text-center text-[0.78rem] text-faint">Aucun mouvement {sensF === "entree" ? "en entrée" : "en sortie"} sur cette fenêtre.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {visibles.map((t) => {
                const entree = estEntree(t);
                return (
                  <div key={t.id} className="flex items-center gap-2.5 rounded-[8px] border border-border bg-surface-2 px-2.5 py-1.5 text-[0.8rem]">
                    {entree ? <ArrowDownRight className="h-4 w-4 shrink-0" style={{ color: "var(--good)" }} /> : <ArrowUpRight className="h-4 w-4 shrink-0" style={{ color: "var(--oxblood)" }} />}
                    <span className="min-w-0 flex-1 truncate">{t.motif || t.poste || (entree ? "Entrée" : "Sortie")}</span>
                    {t.poste ? <span className="hidden shrink-0 text-faint sm:inline">{t.poste}</span> : null}
                    <span className="shrink-0 font-num font-semibold" style={{ color: entree ? "var(--good)" : "var(--oxblood)" }}>{entree ? "+" : "−"}{money(Math.abs(t.montant))}</span>
                    <span className="hidden shrink-0 text-[0.68rem] text-faint md:inline">{dateFR(t.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {payer ? <PayerModal membres={membres} onClose={() => setPayer(false)} router={router} /> : null}
      {ajuster ? <AjusterModal membres={membres} onClose={() => setAjuster(false)} router={router} /> : null}
    </>
  );
}

function MembrePicker({ membres, value, onChange }: { membres: MembreLite[]; value: string; onChange: (id: string, nom: string) => void }) {
  const [q, setQ] = useState("");
  const filtres = membres.filter((m) => m.nom.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <div className="flex flex-col gap-1.5">
      <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un membre…" />
      <div className="max-h-40 overflow-y-auto rounded-[10px] border border-border bg-surface-2">
        {filtres.length === 0 ? <p className="px-3 py-2 text-[0.78rem] text-faint">Aucun membre.</p> : filtres.map((m) => (
          <button key={m.id} onClick={() => onChange(m.id, m.nom)} className="flex w-full items-center gap-2 border-b border-border px-3 py-1.5 text-left text-[0.82rem] last:border-b-0" style={{ background: value === m.id ? "color-mix(in srgb,var(--accent) 14%,transparent)" : "transparent" }}>
            {m.nom}
          </button>
        ))}
      </div>
    </div>
  );
}

function PayerModal({ membres, onClose, router }: { membres: MembreLite[]; onClose: () => void; router: Router }) {
  const [id, setId] = useState(""); const [nom, setNom] = useState("");
  const [montant, setMontant] = useState(""); const [raison, setRaison] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  async function envoyer() {
    setErr(null);
    if (!id) { setErr("Choisis un destinataire."); return; }
    if (!(Number(montant) > 0)) { setErr("Montant invalide."); return; }
    setBusy(true);
    const r = await payerMembre(id, nom, Number(montant), raison);
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh(); onClose();
  }

  return (
    <Modal titre="💸 Payer un membre" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Destinataire{nom ? ` · ${nom}` : ""}</span>
          <MembrePicker membres={membres} value={id} onChange={(i, n) => { setId(i); setNom(n); }} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Montant ($)"><input className={inputCls} type="number" min={1} value={montant} onChange={(e) => setMontant(e.target.value)} autoFocus /></Champ>
          <Champ label="Raison"><input className={inputCls} value={raison} onChange={(e) => setRaison(e.target.value)} placeholder="Part de contrat…" maxLength={120} /></Champ>
        </div>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={envoyer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Envoyer
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AjusterModal({ membres, onClose, router }: { membres: MembreLite[]; onClose: () => void; router: Router }) {
  const [id, setId] = useState(""); const [nom, setNom] = useState("");
  const [sens, setSens] = useState<"credit" | "debit">("credit");
  const [montant, setMontant] = useState(""); const [raison, setRaison] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  async function appliquer() {
    setErr(null);
    if (!id) { setErr("Choisis un membre."); return; }
    if (!(Number(montant) > 0)) { setErr("Montant invalide."); return; }
    const signed = sens === "debit" ? -Number(montant) : Number(montant);
    setBusy(true);
    const r = await ajusterArgent(id, signed, raison);
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh(); onClose();
  }

  return (
    <Modal titre="💵 Créditer / débiter un portefeuille" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Membre{nom ? ` · ${nom}` : ""}</span>
          <MembrePicker membres={membres} value={id} onChange={(i, n) => { setId(i); setNom(n); }} /></div>
        <div className="flex gap-2">
          <button onClick={() => setSens("credit")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.8rem] font-semibold" style={{ color: sens === "credit" ? "#000" : "var(--good)", background: sens === "credit" ? "var(--good)" : "transparent", borderColor: "color-mix(in srgb,var(--good) 45%,var(--border))" }}><Plus className="h-3.5 w-3.5" /> Créditer</button>
          <button onClick={() => setSens("debit")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.8rem] font-semibold" style={{ color: sens === "debit" ? "#fff" : "var(--oxblood)", background: sens === "debit" ? "var(--oxblood)" : "transparent", borderColor: "color-mix(in srgb,var(--oxblood) 45%,var(--border))" }}><Minus className="h-3.5 w-3.5" /> Débiter</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Montant ($)"><input className={inputCls} type="number" min={1} value={montant} onChange={(e) => setMontant(e.target.value)} /></Champ>
          <Champ label="Raison"><input className={inputCls} value={raison} onChange={(e) => setRaison(e.target.value)} placeholder="Prime, sanction…" maxLength={120} /></Champ>
        </div>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={appliquer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: sens === "debit" ? "var(--oxblood)" : "var(--good)" }}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Landmark className="h-3.5 w-3.5" />} Appliquer
          </button>
        </div>
      </div>
    </Modal>
  );
}
