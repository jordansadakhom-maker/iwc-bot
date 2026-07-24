"use client";

import { useEffect, useState } from "react";
import { Loader2, Receipt, ShoppingBag, FileCheck, FileText, User, ArrowRight } from "lucide-react";
import { Modal, inputCls } from "@/components/edit-ui";
import { money, factureStatut, factureOuverte } from "@/lib/dispensaire-facturation-const";
import { getConsultationRefs, getDossierPatient, type DossierPatient, type DossierActe } from "@/app/dispensaire/factures/actions";

// ── Dossier patient (vue 360°, dérivée à la lecture) ─────────────────────────
// Reconstruit tout l'historique d'un patient (factures, ventes, certificats,
// rapports) + son solde dû/réglé, sans nouvelle table.

const dateFR = (s: string | null) => { if (!s) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", year: "numeric" }).format(new Date(s)); } catch { return "—"; } };
const ICONE: Record<DossierActe["type"], typeof Receipt> = { Facture: Receipt, Vente: ShoppingBag, Certificat: FileCheck, Rapport: FileText };

export function DispensairePatientDossier({ onClose, initialNom }: { onClose: () => void; initialNom?: string }) {
  const [patients, setPatients] = useState<string[]>([]);
  const [nom, setNom] = useState(initialNom || "");
  const [dossier, setDossier] = useState<DossierPatient | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { let ok = true; getConsultationRefs().then((r) => { if (ok) setPatients(r.patients); }).catch(() => {}); return () => { ok = false; }; }, []);
  useEffect(() => { if (initialNom && initialNom.trim()) charger(initialNom); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function charger(n: string) {
    if (!n.trim()) return;
    setBusy(true);
    const d = await getDossierPatient(n);
    setBusy(false);
    setDossier(d);
  }

  return (
    <Modal titre="Dossier patient" onClose={onClose} max={620}>
      <div className="flex flex-col gap-3">
        <datalist id="dossier-patients">{patients.map((p) => <option key={p} value={p} />)}</datalist>
        <div className="flex gap-2">
          <input className={inputCls} list="dossier-patients" value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") charger(nom); }} placeholder="Nom du patient…" autoFocus />
          <button onClick={() => charger(nom)} disabled={busy || !nom.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />} Ouvrir</button>
        </div>

        {!dossier ? (
          <p className="px-1 py-8 text-center text-[0.85rem] italic text-faint">Choisis un patient pour voir son dossier complet.</p>
        ) : dossier.nbActes === 0 ? (
          <p className="px-1 py-8 text-center text-[0.85rem] italic text-faint">Aucun acte enregistré pour <b className="not-italic text-ink">{dossier.nom}</b>.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg text-black/85" style={{ background: "var(--accent)" }}><User className="h-4 w-4" /></span>
              <div className="min-w-0"><div className="truncate text-[0.95rem] font-semibold">{dossier.nom}</div><div className="text-[0.72rem] text-faint">{dossier.nbActes} acte(s) au dossier</div></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-[11px] border p-2.5 text-center" style={{ borderColor: dossier.totalDu > 0 ? "color-mix(in srgb,var(--oxblood) 45%,var(--border))" : "var(--border)", background: "var(--surface-2)" }}>
                <div className="text-[0.68rem] text-faint">Dû (impayé)</div>
                <div className="font-num text-[1.15rem] font-bold" style={{ color: dossier.totalDu > 0 ? "var(--oxblood)" : "var(--ink)" }}>{money(dossier.totalDu)}</div>
              </div>
              <div className="rounded-[11px] border border-border bg-surface-2 p-2.5 text-center"><div className="text-[0.68rem] text-faint">Réglé</div><div className="font-num text-[1.15rem] font-bold" style={{ color: "var(--good)" }}>{money(dossier.totalRegle)}</div></div>
              <div className="rounded-[11px] border border-border bg-surface-2 p-2.5 text-center"><div className="text-[0.68rem] text-faint">Actes</div><div className="font-num text-[1.15rem] font-bold">{dossier.nbActes}</div></div>
            </div>
            <div className="flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto pr-1">
              {dossier.actes.map((a) => {
                const Ic = ICONE[a.type] || Receipt;
                const impaye = a.statut && factureOuverte(a.statut);
                return (
                  <div key={a.id} className="flex items-center gap-2.5 rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[0.82rem]">
                    <Ic className="h-4 w-4 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{a.libelle}</div>
                      <div className="text-[0.68rem] text-faint">{a.type} · {dateFR(a.date)}{a.statut ? ` · ${factureStatut(a.statut).label}` : ""}</div>
                    </div>
                    {a.montant != null ? <span className="shrink-0 font-num font-semibold" style={{ color: impaye ? "var(--oxblood)" : "var(--ink)" }}>{money(a.montant)}</span> : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
