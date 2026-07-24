import { LayoutDashboard, Users, ClipboardList, Boxes, FlaskConical, Archive, BadgeDollarSign, Receipt, ShieldCheck, FileText, BookUser, Stethoscope, ScrollText, FolderOpen, BarChart3, History, ShieldAlert, Sparkles, type LucideIcon } from "lucide-react";

// Onglets de la section Dispensaire de Saint-Denis. `pret` = déjà construit ;
// `restreint` = réservé aux membres habilités (RH/chefs) ; `admin` = permission
// admin requise. Les autres s'afficheront « bientôt » tant qu'ils ne sont pas livrés.
export type DispTab = { href: string; label: string; icon: LucideIcon; pret?: boolean; restreint?: boolean; admin?: boolean; desc?: string };

export const DISP_NAV: DispTab[] = [
  { href: "/dispensaire", label: "Accueil", icon: LayoutDashboard, pret: true, desc: "Le registre du jour — soins, stocks et personnel réunis d'un même regard." },
  { href: "/dispensaire/assistant", label: "Assistant", icon: Sparkles, pret: true, desc: "La veille automatique — ce que le dispensaire a détecté et ce qu'il te propose de faire." },
  { href: "/dispensaire/rh", label: "RH / Salariés", icon: Users, pret: true, restreint: true, desc: "Le personnel du dispensaire, ses fonctions et ses états de service." },
  { href: "/dispensaire/pointage", label: "Pointage", icon: ClipboardList, pret: true, desc: "Prises et fins de service, portées à l'heure près." },
  { href: "/dispensaire/stockage", label: "Stockage", icon: Boxes, pret: true, desc: "L'inventaire des coffres — remèdes, matériel et matières." },
  { href: "/dispensaire/coffres", label: "Coffres", icon: Archive, pret: true, desc: "Les coffres de l'officine et ce qu'ils renferment, sous clé." },
  { href: "/dispensaire/matieres", label: "Matières premières", icon: FlaskConical, pret: true, desc: "Ce qu'il faut réapprovisionner pour tenir l'officine." },
  { href: "/dispensaire/ventes", label: "Ventes", icon: BadgeDollarSign, pret: true, desc: "Le cahier des soins délivrés, patient par patient." },
  { href: "/dispensaire/factures", label: "Factures en retard", icon: Receipt, pret: true, restreint: true, desc: "Les créances impayées et l'état de leur relance." },
  { href: "/dispensaire/fdo", label: "Soins FDO", icon: ShieldCheck, pret: true, desc: "Soins portés aux forces de l'ordre du comté." },
  { href: "/dispensaire/frais", label: "Notes de frais", icon: FileText, pret: true, desc: "Dépenses avancées, en attente de remboursement." },
  { href: "/dispensaire/certificats", label: "Certificats", icon: Stethoscope, pret: true, desc: "Certificats médicaux, prêts à sceller et à imprimer." },
  { href: "/dispensaire/rapports", label: "Rapports médicaux", icon: ScrollText, pret: true, desc: "Comptes rendus et planches d'examen." },
  { href: "/dispensaire/stats", label: "Statistiques", icon: BarChart3, pret: true, desc: "L'activité de l'officine en chiffres et en courbes." },
  { href: "/dispensaire/historique", label: "Historique", icon: History, pret: true, desc: "La main courante — tout ce qui a été porté au registre." },
  { href: "/repertoire", label: "Répertoire", icon: BookUser, pret: true, desc: "Les contacts et correspondants du dispensaire." },
  { href: "/dispensaire/documents", label: "Documents", icon: FolderOpen, pret: true, desc: "Pièces officielles et modèles, à portée de main." },
  { href: "/dispensaire/admin", label: "Administration", icon: ShieldAlert, pret: true, admin: true, desc: "Rôles, habilitations et réglages du dispensaire." },
];

// Routes hors barre d'onglets qui méritent tout de même un en-tête de folio.
export const DISP_EXTRA: Record<string, { label: string; desc: string }> = {
  "/dispensaire/recherche": { label: "Recherche globale", desc: "Fouiller tout le registre d'un seul mot." },
  "/dispensaire/notifications": { label: "Notifications", desc: "Les avis et rappels adressés au dispensaire." },
};
