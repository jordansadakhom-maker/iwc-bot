import { LayoutDashboard, Users, ClipboardList, Boxes, BadgeDollarSign, Receipt, ShieldCheck, FileText, BookUser, Stethoscope, type LucideIcon } from "lucide-react";

// Onglets de la section Dispensaire de Saint-Denis. `pret` = déjà construit ;
// `restreint` = réservé aux membres habilités (RH). Les autres s'afficheront
// « bientôt » tant qu'ils ne sont pas livrés.
export type DispTab = { href: string; label: string; icon: LucideIcon; pret?: boolean; restreint?: boolean };

export const DISP_NAV: DispTab[] = [
  { href: "/dispensaire", label: "Accueil", icon: LayoutDashboard, pret: true },
  { href: "/dispensaire/rh", label: "RH / Salariés", icon: Users, pret: true, restreint: true },
  { href: "/dispensaire/pointage", label: "Pointage", icon: ClipboardList },
  { href: "/dispensaire/stockage", label: "Stockage", icon: Boxes },
  { href: "/dispensaire/ventes", label: "Ventes", icon: BadgeDollarSign },
  { href: "/dispensaire/factures", label: "Factures en retard", icon: Receipt, restreint: true },
  { href: "/dispensaire/fdo", label: "Soins FDO", icon: ShieldCheck },
  { href: "/dispensaire/frais", label: "Notes de frais", icon: FileText },
  { href: "/dispensaire/certificats", label: "Certificats", icon: Stethoscope },
  { href: "/repertoire", label: "Répertoire", icon: BookUser, pret: true },
  { href: "/dispensaire/documents", label: "Documents", icon: FileText },
];
