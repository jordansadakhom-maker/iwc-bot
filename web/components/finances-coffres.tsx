"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, Landmark, Skull, Loader2, Pencil } from "lucide-react";
import { Modal, Flash, Picker, inputCls } from "@/components/edit-ui";
import { ajusterCoffre } from "@/app/(app)/finances/actions";
import { cents, round2 } from "@/lib/format";

type Cible = "commun" | "legal" | "illegal";
type Router = ReturnType<typeof useRouter>;

const ICONS = { commun: Wallet, legal: Landmark, illegal: Skull } as const;

function money(n: number | null) {
  return n === null || n === undefined ? "—" : "$" + cents(n);
}

// Sceau de laiton (médaillon frappé « $ ») — signe le coffre.
function Sceau() {
  return (
    <svg width={40} height={40} viewBox="0 0 100 100" aria-hidden="true" style={{ filter: "drop-shadow(0 2px 3px rgba(50,34,10,.45))" }}>
      <defs>
        <radialGradient id="fx-coin" cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#e2c483" /><stop offset="55%" stopColor="#b78d33" /><stop offset="100%" stopColor="#6d4f13" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="44" fill="url(#fx-coin)" />
      <circle cx="50" cy="50" r="44" fill="none" stroke="#4a370f" strokeWidth="1.4" opacity="0.5" />
      <circle cx="50" cy="50" r="35" fill="none" stroke="#f4e4c1" strokeWidth="1.1" strokeDasharray="2 3" opacity="0.6" />
      <text x="50" y="63" textAnchor="middle" fontFamily="Georgia,'Times New Roman',serif" fontSize="38" fontWeight="700" fill="#f6ecd3" opacity="0.92">$</text>
    </svg>
  );
}
// Rivets d'angle — donne le relief « porte de coffre-fort ».
function Rivets() {
  const dot = { position: "absolute" as const, width: 5, height: 5, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%, color-mix(in srgb,var(--brass) 70%,#fff), color-mix(in srgb,var(--brass) 30%,#000))", opacity: 0.55 };
  return (
    <span aria-hidden>
      <span style={{ ...dot, top: 8, left: 8 }} /><span style={{ ...dot, top: 8, right: 8 }} />
      <span style={{ ...dot, bottom: 8, left: 8 }} /><span style={{ ...dot, bottom: 8, right: 8 }} />
    </span>
  );
}

export function FinancesCoffres({
  cartes,
  connecte,
  peut = true,
}: {
  cartes: { cible: Cible; label: string; val: number | null; tone: string }[];
  connecte: boolean;
  peut?: boolean; // droit d'ajuster (officier/Direction) — sinon lecture seule
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ cible: Cible; label: string; val: number | null } | null>(null);
  const totalShown = cartes.reduce((a, c) => a + (c.val ?? 0), 0);

  return (
    <>
      <section className="rounded-card border p-[18px] shadow-card" style={{ borderColor: "color-mix(in srgb,var(--brass) 34%,var(--border))", background: "linear-gradient(180deg,color-mix(in srgb,var(--surface) 93%,var(--brass)),color-mix(in srgb,var(--surface) 86%,#000))" }}>
        {/* En-tête du coffre */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Sceau />
            <div>
              <h3 className="font-display text-[1.2rem] leading-none">Le Coffre</h3>
              <p className="mt-1.5 text-[0.72rem] text-faint">Coffre commun + coffre du pôle actif — dépôt / retrait</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-faint">En réserve</div>
            <div className="font-num text-[1.5rem] font-semibold" style={connecte ? { color: "var(--brass-hi)", textShadow: "0 0 22px color-mix(in srgb,var(--brass-hi) 30%,transparent)" } : { color: "var(--faint)" }}>{connecte ? money(totalShown) : "—"}</div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {cartes.map((c) => {
            const Icon = ICONS[c.cible];
            return (
              <div key={c.cible} className="relative overflow-hidden rounded-[13px] border p-[18px]" style={{ borderColor: `color-mix(in srgb,${c.tone} 40%,var(--border))`, background: "linear-gradient(160deg,color-mix(in srgb,var(--surface-2) 92%,var(--brass)),color-mix(in srgb,var(--surface-2) 84%,#000))", boxShadow: `inset 0 0 0 1px color-mix(in srgb,${c.tone} 16%,transparent), inset 0 0 34px -20px ${c.tone}` }}>
                <Rivets />
                <div className="flex items-center justify-between">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">{c.label}</span>
                  <span className="grid h-9 w-9 place-items-center rounded-full border" style={{ color: c.tone, borderColor: `color-mix(in srgb,${c.tone} 45%,var(--border))`, background: `radial-gradient(circle at 30% 25%, color-mix(in srgb,${c.tone} 22%,transparent), transparent 70%)` }}>
                    <Icon className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                </div>
                <div
                  className={"tabular mb-2 mt-3 font-num text-[2rem] font-semibold " + (connecte ? "" : "text-faint")}
                  style={connecte ? { color: "var(--brass-hi)", textShadow: "0 0 24px color-mix(in srgb, var(--brass-hi) 32%, transparent)" } : undefined}
                >{connecte ? money(c.val) : "—"}</div>
                <div className="flex items-center justify-between border-t pt-2.5" style={{ borderColor: "color-mix(in srgb,var(--border) 85%,transparent)" }}>
                  <span className="inline-flex items-center gap-1.5 text-[0.7rem] text-faint">
                    <span className="h-2 w-2 rounded-full" style={{ background: connecte ? "var(--good)" : "var(--faint)", boxShadow: connecte ? "0 0 8px var(--good)" : "none" }} />
                    {connecte ? "Scellé · à jour" : "En attente de la base"}
                  </span>
                  {connecte && peut ? (
                    <button onClick={() => setEdit({ cible: c.cible, label: c.label, val: c.val })} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[0.72rem] font-semibold hover:border-border-2">
                      <Pencil className="h-3 w-3" /> Ajuster
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {edit ? <AjustModal coffre={edit} onClose={() => setEdit(null)} router={router} /> : null}
    </>
  );
}

function AjustModal({ coffre, onClose, router }: { coffre: { cible: Cible; label: string; val: number | null }; onClose: () => void; router: Router }) {
  const [mode, setMode] = useState<"depot" | "retrait" | "set">("depot");
  const [montant, setMontant] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const n = round2(Number(montant.replace(",", ".")));
  const apercu = () => {
    const base = coffre.val ?? 0;
    if (!Number.isFinite(n)) return base;
    if (mode === "set") return Math.max(0, n);
    if (mode === "retrait") return Math.max(0, base - Math.abs(n));
    return base + Math.abs(n);
  };

  async function valider() {
    setErr(null);
    if (!Number.isFinite(n) || n < 0) { setErr("Entre un montant valide."); return; }
    setBusy(true);
    const r = await ajusterCoffre(coffre.cible, n, mode);
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    setOk(true); router.refresh();
  }
  const nouveauLibelle = money(apercu());

  return (
    <Modal titre={`Ajuster — ${coffre.label}`} onClose={onClose} max={420}>
      {ok ? (
        <div className="flex flex-col gap-3">
          <Flash>Coffre mis à jour — nouveau solde : <b className="font-num">{nouveauLibelle}</b>. Le bot confirme dans les secondes qui suivent.</Flash>
          <div className="flex justify-end"><button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button></div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-[0.82rem] text-muted">Solde actuel : <b className="font-num text-ink">{money(coffre.val)}</b></div>
          <div className="flex flex-col gap-1">
            <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Opération</span>
            <Picker
              options={[{ key: "depot", label: "Dépôt", tone: "var(--good)" }, { key: "retrait", label: "Retrait", tone: "var(--oxblood)" }, { key: "set", label: "Montant exact", tone: "var(--accent)" }]}
              value={mode}
              onChange={(v) => setMode(v as "depot" | "retrait" | "set")}
            />
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Montant ($)</span>
            <input className={inputCls} value={montant} onChange={(e) => setMontant(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0,00" inputMode="decimal" autoFocus />
          </label>
          {montant ? <div className="text-[0.8rem] text-muted">Nouveau solde : <b className="font-num text-ink">{money(apercu())}</b></div> : null}
          {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
          <div className="mt-1 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
            <button onClick={valider} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Valider
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
