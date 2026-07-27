import { ScrollText, ChevronRight } from "lucide-react";
import type { AuditEntree } from "@/lib/dispensaire-evenements";

// Libellés lisibles par type d'action (aggregate.verbe). Repli propre sinon.
const LABEL: Record<string, string> = {
  "membre.cree": "Membre ajouté", "membre.maj": "Membre modifié", "membre.supprime": "Membre supprimé",
  "grade.cree": "Grade créé", "grade.maj": "Grade modifié", "grade.supprime": "Grade supprimé", "grade.reordonne": "Grades réordonnés",
  "config.maj": "Paramètres modifiés",
  "salarie.cree": "Salarié ajouté", "salarie.maj": "Salarié modifié", "salarie.supprime": "Salarié supprimé", "salarie.absence": "Absences ajustées",
  "stock.item_cree": "Article créé", "stock.item_maj": "Article modifié", "stock.item_supprime": "Article supprimé", "stock.ajuste": "Stock ajusté", "stock.deplace": "Article déplacé",
  "coffre.cree": "Coffre créé", "coffre.maj": "Coffre modifié", "coffre.supprime": "Coffre supprimé", "coffre.import_plan": "Plan de rangement importé",
  "matiere.cree": "Matière créée", "matiere.maj": "Matière modifiée", "matiere.supprime": "Matière supprimée", "matiere.ajuste": "Matière ajustée",
  "vente.cree": "Vente enregistrée", "vente.supprime": "Vente supprimée",
  "facture.cree": "Facture créée", "facture.maj": "Facture modifiée", "facture.paiement": "Facture payée", "facture.supprime": "Facture supprimée", "facture.consultation": "Consultation",
  "fdo.cree": "Soin FDO créé", "fdo.maj": "Soin FDO modifié", "fdo.supprime": "Soin FDO supprimé",
  "frais.cree": "Note de frais déposée", "frais.statut": "Frais — statut changé", "frais.supprime": "Note de frais supprimée",
  "certificat.cree": "Certificat émis", "certificat.supprime": "Certificat supprimé",
  "rapport.cree": "Rapport créé", "rapport.maj": "Rapport modifié", "rapport.supprime": "Rapport supprimé",
  "pointage.debut": "Prise de service", "pointage.fin": "Fin de service", "pointage.supprime": "Pointage supprimé",
  "patient.dossier_maj": "Dossier médical modifié",
  "prise_en_charge.admis": "Patient admis", "prise_en_charge.attribue": "Médecin attribué", "prise_en_charge.soin": "Soin démarré", "prise_en_charge.termine": "Prise en charge terminée", "prise_en_charge.annule": "Prise en charge annulée",
};
const MODULE_LABEL: Record<string, string> = { membre: "Accès", grade: "Grades", config: "Config", salarie: "RH", stock: "Stock", coffre: "Coffres", matiere: "Matières", vente: "Ventes", facture: "Factures", fdo: "FDO", frais: "Frais", certificat: "Certificats", rapport: "Rapports", pointage: "Pointage", patient: "Patients", prise_en_charge: "Prise en charge" };
const TON: Record<string, string> = { membre: "var(--accent)", grade: "var(--warn)", config: "var(--steel)", salarie: "var(--good)", stock: "var(--accent)", coffre: "var(--steel)", matiere: "var(--warn)", vente: "var(--good)", facture: "var(--accent)", fdo: "var(--steel)", frais: "var(--warn)", certificat: "var(--good)", rapport: "var(--steel)", pointage: "var(--accent)", patient: "var(--good)", prise_en_charge: "var(--accent)" };

const dtFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };

// Aplati un objet en paires "clé: valeur" lisibles (valeurs longues tronquées).
function paires(v: unknown): [string, string][] {
  if (!v || typeof v !== "object") return [];
  return Object.entries(v as Record<string, unknown>).map(([k, val]) => {
    let t = val == null ? "∅" : typeof val === "object" ? JSON.stringify(val) : String(val);
    if (t.length > 80) t = t.slice(0, 77) + "…";
    return [k, t];
  });
}

export function DispensaireJournalAudit({ data }: { data: { pret: boolean; entrees: AuditEntree[] } }) {
  return (
    <section className="rounded-[14px] border border-border bg-surface p-4">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><ScrollText className="h-4 w-4 text-accent" /> Journal d&apos;audit</h3>
        {data.pret ? <span className="font-num text-[0.8rem] text-faint">{data.entrees.length}</span> : null}
      </div>
      <p className="mb-3 text-[0.76rem] text-muted">Trace horodatée des changements sensibles (accès, grades, paramètres, RH) — qui, quand, avant → après.</p>

      {!data.pret ? (
        <div className="rounded-[12px] border border-dashed border-border-2 bg-surface-2 px-4 py-6 text-center text-[0.82rem] text-muted">
          Journal non activé. Lance <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.76rem]">dispensaire-event-socle.sql</code> sur la base du Dispensaire pour commencer à enregistrer.
        </div>
      ) : data.entrees.length === 0 ? (
        <p className="py-6 text-center text-[0.82rem] italic text-faint">Aucune écriture pour l&apos;instant — les prochaines actions apparaîtront ici.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border/60">
          {data.entrees.map((e) => {
            const av = paires(e.avant), ap = paires(e.apres);
            const ton = TON[e.module] || "var(--muted)";
            return (
              <div key={e.id} className="py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.82rem]">
                  <span className="rounded-full px-2 py-0.5 text-[0.66rem] font-bold uppercase tracking-[0.04em]" style={{ color: ton, background: `color-mix(in srgb,${ton} 14%,transparent)` }}>{MODULE_LABEL[e.module] || e.module}</span>
                  <span className="font-semibold">{LABEL[e.action] || e.action}</span>
                  {e.cible ? <span className="text-muted">· {e.cible}</span> : null}
                  <span className="ml-auto whitespace-nowrap font-num text-[0.72rem] text-faint">{e.par ? `${e.par} · ` : ""}{dtFR(e.at)}</span>
                </div>
                {(av.length || ap.length) ? (
                  <details className="mt-1 group">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[0.72rem] text-faint transition hover:text-muted">
                      <ChevronRight className="h-3 w-3 transition group-open:rotate-90" /> Détail
                    </summary>
                    <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                      {av.length ? (
                        <div className="rounded-[10px] border border-border bg-surface-2 p-2">
                          <div className="mb-1 text-[0.66rem] font-bold uppercase tracking-[0.04em] text-faint">Avant</div>
                          <dl className="flex flex-col gap-0.5 text-[0.76rem]">{av.map(([k, val]) => <div key={k} className="flex gap-1.5"><dt className="shrink-0 text-muted">{k}</dt><dd className="min-w-0 break-words font-mono text-[0.72rem]">{val}</dd></div>)}</dl>
                        </div>
                      ) : null}
                      {ap.length ? (
                        <div className="rounded-[10px] border p-2" style={{ borderColor: "color-mix(in srgb,var(--good) 30%,var(--border))", background: "color-mix(in srgb,var(--good) 6%,var(--surface-2))" }}>
                          <div className="mb-1 text-[0.66rem] font-bold uppercase tracking-[0.04em]" style={{ color: "var(--good)" }}>Après</div>
                          <dl className="flex flex-col gap-0.5 text-[0.76rem]">{ap.map(([k, val]) => <div key={k} className="flex gap-1.5"><dt className="shrink-0 text-muted">{k}</dt><dd className="min-w-0 break-words font-mono text-[0.72rem]">{val}</dd></div>)}</dl>
                        </div>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
