import { LayoutDashboard, Users, ClipboardList, Boxes, FlaskConical, Archive, BadgeDollarSign, Receipt, ShieldCheck, FileText, BookUser, Stethoscope, ScrollText, FolderOpen, BarChart3, History, ShieldAlert, type LucideIcon } from "lucide-react";

// Onglets de la section Dispensaire de Saint-Denis. `pret` = déjà construit ;
// `restreint` = réservé aux membres habilités (RH/chefs) ; `admin` = permission
// admin requise. Les autres s'afficheront « bientôt » tant qu'ils ne sont pas livrés.
export type DispTab = { href: string; label: string; icon: LucideIcon; pret?: boolean; restreint?: boolean; admin?: boolean };

export const DISP_NAV: DispTab[] = [
  { href: "/dispensaire", label: "Accueil", icon: LayoutDashboard, pret: true },
  { href: "/dispensaire/rh", label: "RH / Salariés", icon: Users, pret: true, restreint: true },
  { href: "/dispensaire/pointage", label: "Pointage", icon: ClipboardList, pret: true },
  { href: "/dispensaire/stockage", label: "Stockage", icon: Boxes, pret: true },
  { href: "/dispensaire/coffres", label: "Coffres", icon: Archive, pret: true },
  { href: "/dispensaire/matieres", label: "Matières premières", icon: FlaskConical, pret: true },
  { href: "/dispensaire/ventes", label: "Ventes", icon: BadgeDollarSign, pret: true },
  { href: "/dispensaire/factures", label: "Factures en retard", icon: Receipt, pret: true, restreint: true },
  { href: "/dispensaire/fdo", label: "Soins FDO", icon: ShieldCheck, pret: true },
  { href: "/dispensaire/frais", label: "Notes de frais", icon: FileText, pret: true },
  { href: "/dispensaire/certificats", label: "Certificats", icon: Stethoscope, pret: true },
  { href: "/dispensaire/rapports", label: "Rapports médicaux", icon: ScrollText, pret: true },
  { href: "/dispensaire/stats", label: "Statistiques", icon: BarChart3, pret: true },
  { href: "/dispensaire/historique", label: "Historique", icon: History, pret: true },
  { href: "/repertoire", label: "Répertoire", icon: BookUser, pret: true },
  { href: "/dispensaire/documents", label: "Documents", icon: FolderOpen, pret: true },
  { href: "/dispensaire/admin", label: "Administration", icon: ShieldAlert, pret: true, admin: true },
];
