"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt, Plus, Loader2, Trash2 } from "lucide-react";
import type { FactureItem } from "@/lib/queries";
import { Modal, Flash, Champ, inputCls } from "@/components/edit-ui";
import { creerFacture, supprimerFacture } from "@/app/(app)/finances/actions";

type Router = ReturnType<typeof useRouter>;
import { cents } from "@/lib/format";
const money = (n: number) => "$" + cents(n);
const dateFR = (s: string | null) => { if (!s) return "—"; try { return new Date(s).toLocaleDateString("fr-FR"); } catch { return "—"; } };

export function FacturesListe({ factures, total }: { factures: FactureItem[]; total: number }) {
  const router = useRouter();
  const [nouveau, setNouveau] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  async function supprimer(id: string) {
    setBusy(true); setFlash(null);
    const r = await supprimerFacture(id);
    setBusy(false);
    if (r.ok) { setDelId(null); router.refresh(); }
    else { setDelId(null); setFlash(r.error || "Échec de la suppression."); } // ne plus rester muet en cas d'échec
  }

  return (
    <>
      {flash ? <div className="mb-3"><Flash>{flash}</Flash></div> : null}
      <div className="mb-3.5 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Factures</h3>
          <span className="font-num text-[0.8rem] text-faint">{factures.length}</span>
          {total > 0 ? <span className="rounded-md px-1.5 py-0.5 font-num text-[0.72rem] font-semibold" style={{ color: "var(--good)", background: "color-mix(in srgb,var(--good) 14%,transparent)" }}>{money(total)} encaissés</span> : null}
        </div>
        <button onClick={() => setNouveau(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2">
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Nouvelle facture
        </button>
      </div>

      {factures.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full border" style={{ borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))", background: "color-mix(in srgb,var(--accent) 8%,transparent)" }}>
            <Receipt className="h-5 w-5" style={{ color: "color-mix(in srgb,var(--accent) 70%,var(--faint))" }} strokeWidth={1.6} />
          </span>
          <p className="max-w-md font-display text-[0.9rem] italic text-muted">Aucune facture. Elles se créent à chaque contrat honoré, ou à la main ici.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[0.85rem]">
            <thead>
              <tr className="text-[0.7rem] uppercase tracking-[0.06em] text-faint">
                <th className="border-b border-border px-2.5 py-2 font-semibold">N°</th>
                <th className="border-b border-border px-2.5 py-2 font-semibold">Client</th>
                <th className="border-b border-border px-2.5 py-2 font-semibold">Objet</th>
                <th className="border-b border-border px-2.5 py-2 font-semibold">Date</th>
                <th className="border-b border-border px-2.5 py-2 text-right font-semibold">Montant</th>
                <th className="border-b border-border px-2.5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {factures.map((f) => (
                <tr key={f.id} className="hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                  <td className="border-b border-border px-2.5 py-2.5 font-num font-medium">{f.numero}</td>
                  <td className="border-b border-border px-2.5 py-2.5">{f.clientNom || "—"}</td>
                  <td className="border-b border-border px-2.5 py-2.5 text-muted">{f.objet}</td>
                  <td className="border-b border-border px-2.5 py-2.5 font-num text-faint">{dateFR(f.createdAt)}</td>
                  <td className="border-b border-border px-2.5 py-2.5 text-right font-num font-semibold" style={{ color: "var(--good)" }}>{money(f.montant)}</td>
                  <td className="border-b border-border px-2.5 py-2.5 text-right">
                    {delId === f.id ? (
                      <span className="inline-flex items-center gap-1.5 text-[0.74rem]">
                        <button onClick={() => supprimer(f.id)} disabled={busy} className="rounded px-1.5 py-0.5 font-semibold text-black/85" style={{ background: "var(--oxblood)" }}>{busy ? "…" : "Oui"}</button>
                        <button onClick={() => setDelId(null)} className="text-muted hover:text-ink">Non</button>
                      </span>
                    ) : (
                      <button onClick={() => setDelId(f.id)} className="text-faint hover:text-ink" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nouveau ? <NouvelleFacture onClose={() => setNouveau(false)} router={router} /> : null}
    </>
  );
}

function NouvelleFacture({ onClose, router }: { onClose: () => void; router: Router }) {
  const [objet, setObjet] = useState("");
  const [montant, setMontant] = useState("");
  const [clientNom, setClientNom] = useState("");
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function creer() {
    setErr(null);
    if (objet.trim().length < 2) { setErr("Indique l'objet."); return; }
    const m = Number(montant);
    if (!Number.isFinite(m) || m <= 0) { setErr("Montant invalide."); return; }
    setBusy(true);
    const r = await creerFacture({ objet, montant: m, clientNom, type });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    setOk(true); router.refresh();
  }

  return (
    <Modal titre="🧾 Nouvelle facture" onClose={onClose} max={440}>
      {ok ? (
        <div className="flex flex-col gap-3"><Flash>Facture créée — elle apparaîtra dans ~30 s.</Flash><div className="flex justify-end"><button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button></div></div>
      ) : (
        <div className="flex flex-col gap-3">
          {err ? <Flash tone="bad">{err}</Flash> : null}
          <Champ label="Objet / prestation *"><input className={inputCls} value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Escorte d'une diligence…" maxLength={200} autoFocus /></Champ>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Montant réglé ($) *"><input className={inputCls} value={montant} onChange={(e) => setMontant(e.target.value.replace(/[^0-9]/g, ""))} placeholder="250" inputMode="numeric" /></Champ>
            <Champ label="Client"><input className={inputCls} value={clientNom} onChange={(e) => setClientNom(e.target.value)} placeholder="Earl le forgeron" maxLength={100} /></Champ>
          </div>
          <Champ label="Type (optionnel)"><input className={inputCls} value={type} onChange={(e) => setType(e.target.value)} placeholder="Contrat, Soin médical…" maxLength={80} /></Champ>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
            <button onClick={creer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={2} />} Créer</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
