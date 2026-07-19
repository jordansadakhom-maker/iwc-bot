"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, Landmark, Skull, Loader2, Pencil } from "lucide-react";
import { Modal, Flash, Picker, inputCls } from "@/components/edit-ui";
import { ajusterCoffre } from "@/app/(app)/finances/actions";

type Cible = "commun" | "legal" | "illegal";
type Router = ReturnType<typeof useRouter>;

const ICONS = { commun: Wallet, legal: Landmark, illegal: Skull } as const;

function money(n: number | null) {
  return n === null || n === undefined ? "—" : "$" + n.toLocaleString("fr-FR");
}

export function FinancesCoffres({
  cartes,
  connecte,
}: {
  cartes: { cible: Cible; label: string; val: number | null; tone: string }[];
  connecte: boolean;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ cible: Cible; label: string; val: number | null } | null>(null);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {cartes.map((c) => {
          const Icon = ICONS[c.cible];
          return (
            <div key={c.cible} className="rounded-card border border-border bg-surface p-[18px] shadow-card" style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}>
              <div className="flex items-center justify-between">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-muted">{c.label}</span>
                <span className="grid h-[30px] w-[30px] place-items-center rounded-[9px]" style={{ color: c.tone, background: "color-mix(in srgb, " + c.tone + " 15%,transparent)" }}>
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                </span>
              </div>
              <div className={"tabular mb-1 mt-3 font-num text-[1.9rem] font-semibold " + (connecte ? "text-ink" : "text-faint")}>{connecte ? money(c.val) : "—"}</div>
              <div className="flex items-center justify-between">
                <span className="text-[0.72rem] text-faint">{connecte ? "À jour" : "En attente de la base"}</span>
                {connecte ? (
                  <button onClick={() => setEdit({ cible: c.cible, label: c.label, val: c.val })} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-[0.72rem] font-semibold hover:border-border-2">
                    <Pencil className="h-3 w-3" /> Ajuster
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

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

  const n = Math.round(Number(montant));
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
            <input className={inputCls} value={montant} onChange={(e) => setMontant(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" inputMode="numeric" autoFocus />
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
