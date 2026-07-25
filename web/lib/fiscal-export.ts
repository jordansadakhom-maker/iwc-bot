// Exports du rapport fiscal (Excel .xlsx et PDF). Les librairies sont chargées À
// LA DEMANDE (import dynamique) → elles n'alourdissent PAS le chargement de la
// page, seulement le clic sur « Exporter ». Données = cycle courant + historique.
import type { CycleFiscal } from "@/lib/armurerie-fiscal";
import { euros, pourcent } from "@/lib/armurerie-fiscal";

export type ImpotLigne = {
  libelle: string | null; debut: string | null; fin: string | null;
  chiffreAffaires: number; taux: number; montant: number; statut: string; payeAt: string | null;
};

const dateFR = (s: string | null) => { if (!s) return "—"; try { return new Date(s).toLocaleDateString("fr-FR"); } catch { return "—"; } };
const stamp = () => new Date().toISOString().slice(0, 10);
const r0 = (n: number) => Math.round(Number(n) || 0);

// Lignes du récapitulatif du cycle (partagées Excel / PDF).
function cycleRecap(cycle: CycleFiscal): [string, string][] {
  return [
    ["Chiffre d'affaires (entrées)", euros(cycle.ca)],
    ["Achats & dépenses (sorties)", euros(cycle.depenses)],
    ["Bénéfice", euros(cycle.benefice)],
    ["Tranche appliquée", cycle.seuilTranche == null ? "aucune (< 1 800 $)" : `≥ ${euros(cycle.seuilTranche)} → ${pourcent(cycle.taux)}`],
    ["Impôt dû", euros(cycle.impot)],
    ["Bénéfice net", euros(cycle.net)],
  ];
}

// ── Excel (.xlsx) ─────────────────────────────────────────────────────────────
export async function exporterFiscalExcel(cycle: CycleFiscal, impots: ImpotLigne[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const cycleAoa: (string | number)[][] = [
    ["Situation fiscale — Armurerie de Van Horn"],
    ["Généré le", new Date().toLocaleString("fr-FR")],
    [],
    ["Cycle en cours"],
    ...cycleRecap(cycle),
  ];
  const wsCycle = XLSX.utils.aoa_to_sheet(cycleAoa);
  wsCycle["!cols"] = [{ wch: 30 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsCycle, "Cycle");

  const histAoa: (string | number)[][] = [
    ["Libellé", "Début", "Fin", "CA ($)", "Taux (%)", "Montant ($)", "Statut", "Réglé le"],
    ...impots.map((i) => [i.libelle || "", dateFR(i.debut), dateFR(i.fin), r0(i.chiffreAffaires), i.taux, r0(i.montant), i.statut, dateFR(i.payeAt)]),
  ];
  const wsHist = XLSX.utils.aoa_to_sheet(histAoa);
  wsHist["!cols"] = [{ wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 9 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsHist, "Historique");

  XLSX.writeFile(wb, `fiscal-armurerie-${stamp()}.xlsx`);
}

// ── PDF ───────────────────────────────────────────────────────────────────────
export async function exporterFiscalPDF(cycle: CycleFiscal, impots: ImpotLigne[]) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();

  doc.setFontSize(15);
  doc.text("Situation fiscale — Armurerie de Van Horn", 14, 18);
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`Généré le ${new Date().toLocaleString("fr-FR")}`, 14, 24);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 30,
    head: [["Cycle en cours", ""]],
    body: cycleRecap(cycle),
    theme: "grid",
    headStyles: { fillColor: [51, 80, 90] },
    columnStyles: { 1: { halign: "right" } },
  });

  const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 90;
  autoTable(doc, {
    startY: y + 8,
    head: [["Libellé", "Période", "CA", "Taux", "Montant", "Statut"]],
    body: impots.map((i) => [i.libelle || "", `${dateFR(i.debut)} → ${dateFR(i.fin)}`, euros(i.chiffreAffaires), pourcent(i.taux), euros(i.montant), i.statut]),
    theme: "striped",
    headStyles: { fillColor: [51, 80, 90] },
    styles: { fontSize: 8 },
  });

  doc.save(`fiscal-armurerie-${stamp()}.pdf`);
}
