"use client";

import { createContext, useContext, useState, useCallback, useRef, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

// ─────────────────────────────────────────────────────────────
//  Toasts + confirmation + helper d'action (fluidité générale)
// ─────────────────────────────────────────────────────────────
type Kind = "ok" | "err" | "info";
type Toast = { id: number; msg: string; kind: Kind };

const ToastCtx = createContext<(msg: string, kind?: Kind) => void>(() => {});
const ConfirmCtx = createContext<(msg: string, opts?: { danger?: boolean; ok?: string }) => Promise<boolean>>(async () => false);

export const useToast = () => useContext(ToastCtx);
export const useConfirm = () => useContext(ConfirmCtx);

type CState = { msg: string; danger?: boolean; ok?: string; resolve: (v: boolean) => void } | null;

export function UXProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((msg: string, kind: Kind = "ok") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const [cs, setCs] = useState<CState>(null);
  const confirm = useCallback((msg: string, opts?: { danger?: boolean; ok?: string }) => new Promise<boolean>((resolve) => setCs({ msg, danger: opts?.danger, ok: opts?.ok, resolve })), []);
  const answer = (v: boolean) => { cs?.resolve(v); setCs(null); };

  const Ico = { ok: CheckCircle2, err: AlertTriangle, info: Info };
  return (
    <ToastCtx.Provider value={push}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        <div className="toast-wrap" role="status" aria-live="polite">
          {toasts.map((t) => {
            const I = Ico[t.kind];
            return (
              <div key={t.id} className={`toast-item ${t.kind}`}>
                <I className="h-4 w-4 shrink-0" />
                <span>{t.msg}</span>
              </div>
            );
          })}
        </div>
        {cs ? (
          <div className="modal-backdrop" onClick={() => answer(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: cs.danger ? "var(--oxblood)" : "var(--accent)" }} />
                <p className="text-[0.95rem] leading-snug">{cs.msg}</p>
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn" onClick={() => answer(false)}><X className="h-4 w-4" /> Annuler</button>
                <button className={`btn ${cs.danger ? "" : "btn-accent"}`} style={cs.danger ? { background: "var(--oxblood)", color: "#f4ead6", borderColor: "var(--oxblood)" } : undefined} onClick={() => answer(true)}>{cs.ok || "Confirmer"}</button>
              </div>
            </div>
          </div>
        ) : null}
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}

type ActionResult = { ok: boolean; error?: string };

// Enrobe une action serveur : état « en cours », toast succès/erreur, rafraîchit.
// Renvoie true si l'action a réussi (permet de vider un formulaire ensuite).
export function useAction() {
  const toast = useToast();
  const router = useRouter();
  const [isPending, start] = useTransition();
  const run = useCallback(
    (fn: () => Promise<ActionResult>, okMsg?: string) =>
      new Promise<boolean>((resolve) => {
        start(async () => {
          let r: ActionResult;
          try { r = await fn(); } catch { r = { ok: false, error: "Erreur réseau." }; }
          if (r.ok) { if (okMsg) toast(okMsg, "ok"); router.refresh(); resolve(true); }
          else { toast(r.error || "Échec.", "err"); resolve(false); }
        });
      }),
    [toast, router]
  );
  return { run, isPending };
}
