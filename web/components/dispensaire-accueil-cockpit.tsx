"use client";

import { Boxes, FlaskConical, Receipt, FileText, BadgeDollarSign, Users, CalendarClock, Activity } from "lucide-react";
import type { AccueilData } from "@/lib/dispensaire-accueil";
import { StatWidget } from "@/components/dispensaire-premium";

// Grille de widgets clés du tableau de bord. COMPOSANT CLIENT à dessein : les
// icônes (lucide) et le formateur de montant ne sont PAS sérialisables et ne
// peuvent donc pas traverser la frontière serveur→client (règle RSC). On les
// garde côté client ; la page (serveur) ne passe que des données simples.
const money = (n: number) => `$${Math.round(n).toLocaleString("fr-FR")}`;

export function DispensaireAccueilCockpit({ d, rdvAujourdhui }: { d: AccueilData; rdvAujourdhui: number }) {
  const stockCrit = d.stockAlertes.length;
  const matRupture = d.matieresRupture.length;
  return (
    <div className="disp-rise grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      <StatWidget label="Médecins en service" value={d.enService.length} icon={Users} tone="good" live href="/dispensaire/pointage" sous={d.enService.length ? d.enService.slice(0, 2).map((s) => s.nom).join(" · ") : "Personne en service"} />
      <StatWidget label="RDV aujourd'hui" value={rdvAujourdhui} icon={CalendarClock} href="/dispensaire/rendez-vous" sous={rdvAujourdhui ? "Consultations prévues" : "Aucun rendez-vous"} />
      <StatWidget label="Soins du jour" value={d.ventesJourNb} icon={Activity} tone="good" href="/dispensaire/ventes" sous={`Recette ${money(d.ventesJourCa)}`} />
      <StatWidget label="Stocks critiques" value={stockCrit} icon={Boxes} tone={stockCrit ? "crit" : "steel"} href="/dispensaire/stockage" sous={stockCrit ? d.stockAlertes.slice(0, 2).map((s) => s.nom).join(" · ") : "Tout au-dessus du seuil"} />
      <StatWidget label="Matières en rupture" value={matRupture} icon={FlaskConical} tone={matRupture ? "crit" : "steel"} href="/dispensaire/matieres" sous={matRupture ? d.matieresRupture.slice(0, 2).map((m) => m.nom).join(" · ") : "Rien à commander"} />
      <StatWidget label="Frais en attente" value={d.fraisEnAttente} icon={FileText} tone={d.fraisEnAttente ? "warn" : "steel"} href="/dispensaire/frais" sous={d.fraisEnAttente ? "À valider" : "Rien en attente"} />
      {d.habilite ? <StatWidget label="Factures impayées" value={d.facturesImpayees} icon={Receipt} tone={d.facturesRetard ? "crit" : "warn"} href="/dispensaire/factures" sous={`${d.facturesRetard} en retard · ${money(d.du)} dû`} /> : null}
      <StatWidget label="Recette du jour" value={d.ventesJourCa} format={money} icon={BadgeDollarSign} tone="good" href="/dispensaire/ventes" sous="Ventes encaissées aujourd'hui" />
    </div>
  );
}
