"use client";

import { useEffect, useState } from "react";
import { Loader2, Receipt, ShoppingBag, FileCheck, FileText, User, ArrowRight, HeartPulse, Pencil, Check, X, Droplet } from "lucide-react";
import { Modal, inputCls } from "@/components/edit-ui";
import { ChampPieceJointe, PieceJointeVignette } from "@/components/piece-jointe";
import { money, factureStatut, factureOuverte } from "@/lib/dispensaire-facturation-const";
import { getConsultationRefs, getDossierPatient, getDossierMedical, majDossierMedical, type DossierPatient, type DossierActe, type DossierMedicalResult } from "@/app/dispensaire/factures/actions";

// ── Dossier patient (vue 360° dérivée + dossier médical structuré) ───────────
// Les actes (factures, ventes, certificats, rapports) sont reconstruits par nom ;
// le dossier médical (groupe sanguin, allergies, antécédents…) est une fiche
// stable rattachée au patient.

const dateFR = (s: string | null) => { if (!s) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", year: "numeric" }).format(new Date(s)); } catch { return "—"; } };
const ICONE: Record<DossierActe["type"], typeof Receipt> = { Facture: Receipt, Vente: ShoppingBag, Certificat: FileCheck, Rapport: FileText };
const GROUPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

type MForm = { dateNaissance: string; telephone: string; groupeSanguin: string; allergies: string; antecedents: string; traitements: string; medecinReferent: string; notes: string; pieceJointe: string };
const vide = (): MForm => ({ dateNaissance: "", telephone: "", groupeSanguin: "", allergies: "", antecedents: "", traitements: "", medecinReferent: "", notes: "", pieceJointe: "" });
function fromDossier(m: DossierMedicalResult | null): MForm {
  const d = m?.dossier;
  return { dateNaissance: d?.dateNaissance || "", telephone: d?.telephone || "", groupeSanguin: d?.groupeSanguin || "", allergies: d?.allergies || "", antecedents: d?.antecedents || "", traitements: d?.traitements || "", medecinReferent: d?.medecinReferent || "", notes: d?.notes || "", pieceJointe: d?.pieceJointe || "" };
}

export function DispensairePatientDossier({ onClose, initialNom }: { onClose: () => void; initialNom?: string }) {
  const [patients, setPatients] = useState<string[]>([]);
  const [nom, setNom] = useState(initialNom || "");
  const [dossier, setDossier] = useState<DossierPatient | null>(null);
  const [med, setMed] = useState<DossierMedicalResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [mf, setMf] = useState<MForm>(vide());
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { let ok = true; getConsultationRefs().then((r) => { if (ok) setPatients(r.patients); }).catch(() => {}); return () => { ok = false; }; }, []);
  useEffect(() => { if (initialNom && initialNom.trim()) charger(initialNom); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function charger(n: string) {
    if (!n.trim()) return;
    setBusy(true); setFlash(null);
    const [d, m] = await Promise.all([getDossierPatient(n), getDossierMedical(n)]);
    setBusy(false);
    setDossier(d); setMed(m); setMf(fromDossier(m)); setEdit(false);
  }

  async function enregistrer() {
    const cible = dossier?.nom || nom;
    setSaving(true);
    const r = await majDossierMedical(cible, { ...mf });
    setSaving(false);
    if (!r.ok) { setFlash(r.error || "Enregistrement impossible."); return; }
    const m = await getDossierMedical(cible);
    setMed(m); setMf(fromDossier(m)); setEdit(false); setFlash("Dossier médical enregistré.");
  }

  const set = (k: keyof MForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setMf((p) => ({ ...p, [k]: e.target.value }));
  const champsRenseignes = med?.dossier ? [med.dossier.groupeSanguin, med.dossier.allergies, med.dossier.antecedents, med.dossier.traitements, med.dossier.medecinReferent, med.dossier.dateNaissance, med.dossier.telephone, med.dossier.notes, med.dossier.pieceJointe].some(Boolean) : false;

  return (
    <Modal titre="Dossier patient" onClose={onClose} max={640}>
      <div className="flex flex-col gap-3">
        <datalist id="dossier-patients">{patients.map((p) => <option key={p} value={p} />)}</datalist>
        <div className="flex gap-2">
          <input className={inputCls} list="dossier-patients" value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") charger(nom); }} placeholder="Nom du patient…" autoFocus />
          <button onClick={() => charger(nom)} disabled={busy || !nom.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />} Ouvrir</button>
        </div>

        {flash ? <div className="rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[0.78rem] text-muted">{flash}</div> : null}

        {!dossier ? (
          <p className="px-1 py-8 text-center text-[0.85rem] italic text-faint">Choisis un patient pour voir son dossier complet.</p>
        ) : (
          <>
            {/* En-tête patient */}
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg text-black/85" style={{ background: "var(--accent)" }}><User className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1"><div className="truncate text-[0.95rem] font-semibold">{dossier.nom}</div><div className="text-[0.72rem] text-faint">{dossier.nbActes} acte(s) au dossier</div></div>
              {med?.canEdit && !edit ? <button onClick={() => setEdit(true)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink"><Pencil className="h-3.5 w-3.5" /> {champsRenseignes ? "Éditer" : "Renseigner"} le dossier</button> : null}
            </div>

            {/* Dossier médical */}
            <section className="rounded-[12px] border p-3" style={{ borderColor: "color-mix(in srgb,var(--oxblood) 22%,var(--border))", background: "color-mix(in srgb,var(--oxblood) 4%,var(--surface-2))" }}>
              <div className="mb-2 flex items-center gap-1.5 text-[0.74rem] font-bold uppercase tracking-[0.05em]" style={{ color: "var(--oxblood)" }}><HeartPulse className="h-3.5 w-3.5" /> Dossier médical</div>

              {!med?.pret ? (
                <p className="text-[0.78rem] text-muted">Fiche indisponible — lance <code className="rounded bg-surface px-1 py-0.5 font-mono text-[0.72rem]">dispensaire-patients.sql</code> sur la base.</p>
              ) : edit ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1"><span className="text-[0.68rem] uppercase tracking-[0.04em] text-faint">Groupe sanguin</span>
                    <select className={inputCls} value={mf.groupeSanguin} onChange={set("groupeSanguin")}><option value="">— Inconnu —</option>{GROUPES.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
                  <label className="flex flex-col gap-1"><span className="text-[0.68rem] uppercase tracking-[0.04em] text-faint">Médecin référent</span><input className={inputCls} value={mf.medecinReferent} onChange={set("medecinReferent")} placeholder="Dr…" /></label>
                  <label className="flex flex-col gap-1"><span className="text-[0.68rem] uppercase tracking-[0.04em] text-faint">Date de naissance</span><input className={inputCls} value={mf.dateNaissance} onChange={set("dateNaissance")} placeholder="JJ/MM/AAAA" /></label>
                  <label className="flex flex-col gap-1"><span className="text-[0.68rem] uppercase tracking-[0.04em] text-faint">Téléphone</span><input className={inputCls} value={mf.telephone} onChange={set("telephone")} placeholder="Optionnel" /></label>
                  <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-[0.68rem] uppercase tracking-[0.04em] text-faint">Allergies</span><input className={inputCls} value={mf.allergies} onChange={set("allergies")} placeholder="Pénicilline, latex…" /></label>
                  <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-[0.68rem] uppercase tracking-[0.04em] text-faint">Antécédents</span><textarea className={inputCls} rows={2} value={mf.antecedents} onChange={set("antecedents")} placeholder="Pathologies, opérations…" /></label>
                  <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-[0.68rem] uppercase tracking-[0.04em] text-faint">Traitements en cours</span><textarea className={inputCls} rows={2} value={mf.traitements} onChange={set("traitements")} placeholder="Médicaments, posologie…" /></label>
                  <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-[0.68rem] uppercase tracking-[0.04em] text-faint">Notes</span><textarea className={inputCls} rows={2} value={mf.notes} onChange={set("notes")} placeholder="Observations libres" /></label>
                  <div className="sm:col-span-2"><ChampPieceJointe value={mf.pieceJointe} onChange={(url) => setMf((p) => ({ ...p, pieceJointe: url }))} /></div>
                  <div className="flex items-center justify-end gap-2 sm:col-span-2">
                    <button onClick={() => { setEdit(false); setMf(fromDossier(med)); }} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[0.78rem] font-semibold text-muted hover:text-ink"><X className="h-3.5 w-3.5" /> Annuler</button>
                    <button onClick={enregistrer} disabled={saving} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Enregistrer</button>
                  </div>
                </div>
              ) : champsRenseignes ? (
                <div className="grid gap-x-4 gap-y-1.5 text-[0.82rem] sm:grid-cols-2">
                  {med.dossier?.groupeSanguin ? <Info label="Groupe sanguin" val={med.dossier.groupeSanguin} icon={Droplet} ton="var(--oxblood)" /> : null}
                  {med.dossier?.medecinReferent ? <Info label="Médecin référent" val={med.dossier.medecinReferent} /> : null}
                  {med.dossier?.dateNaissance ? <Info label="Naissance" val={med.dossier.dateNaissance} /> : null}
                  {med.dossier?.telephone ? <Info label="Téléphone" val={med.dossier.telephone} /> : null}
                  {med.dossier?.allergies ? <Info label="Allergies" val={med.dossier.allergies} full ton="var(--oxblood)" /> : null}
                  {med.dossier?.antecedents ? <Info label="Antécédents" val={med.dossier.antecedents} full /> : null}
                  {med.dossier?.traitements ? <Info label="Traitements" val={med.dossier.traitements} full /> : null}
                  {med.dossier?.notes ? <Info label="Notes" val={med.dossier.notes} full /> : null}
                  {med.dossier?.pieceJointe ? <div className="sm:col-span-2"><span className="text-[0.66rem] uppercase tracking-[0.04em] text-faint">Pièce jointe</span><div className="mt-1"><PieceJointeVignette url={med.dossier.pieceJointe} /></div></div> : null}
                </div>
              ) : (
                <p className="text-[0.8rem] italic text-faint">Aucune information médicale renseignée{med.canEdit ? " — clique sur « Renseigner le dossier »." : "."}</p>
              )}
            </section>

            {/* Solde + actes */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-[11px] border p-2.5 text-center" style={{ borderColor: dossier.totalDu > 0 ? "color-mix(in srgb,var(--oxblood) 45%,var(--border))" : "var(--border)", background: "var(--surface-2)" }}>
                <div className="text-[0.68rem] text-faint">Dû (impayé)</div>
                <div className="font-num text-[1.15rem] font-bold" style={{ color: dossier.totalDu > 0 ? "var(--oxblood)" : "var(--ink)" }}>{money(dossier.totalDu)}</div>
              </div>
              <div className="rounded-[11px] border border-border bg-surface-2 p-2.5 text-center"><div className="text-[0.68rem] text-faint">Réglé</div><div className="font-num text-[1.15rem] font-bold" style={{ color: "var(--good)" }}>{money(dossier.totalRegle)}</div></div>
              <div className="rounded-[11px] border border-border bg-surface-2 p-2.5 text-center"><div className="text-[0.68rem] text-faint">Actes</div><div className="font-num text-[1.15rem] font-bold">{dossier.nbActes}</div></div>
            </div>
            {dossier.nbActes === 0 ? (
              <p className="px-1 py-3 text-center text-[0.82rem] italic text-faint">Aucun acte enregistré pour ce patient.</p>
            ) : (
              <div className="flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto pr-1">
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
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// Ligne d'info du dossier médical (lecture).
function Info({ label, val, icon: Icon, ton, full }: { label: string; val: string; icon?: typeof Droplet; ton?: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <span className="text-[0.66rem] uppercase tracking-[0.04em] text-faint">{label}</span>
      <div className="flex items-center gap-1 font-medium" style={ton ? { color: ton } : undefined}>{Icon ? <Icon className="h-3.5 w-3.5" /> : null}<span className="break-words">{val}</span></div>
    </div>
  );
}
