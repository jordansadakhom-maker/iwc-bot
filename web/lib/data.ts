/**
 * Navigation + profil connecté.
 *
 * ⚠️ AUCUNE donnée métier inventée ici. Les vraies valeurs (coffres, contrats,
 * opérations, transactions…) sont lues depuis Supabase — voir `lib/queries.ts`,
 * alimenté par le bot Discord via `supabase-sync.js`.
 */
import {
  LayoutDashboard, LineChart, Target, Eye, Users, HeartPulse, CalendarDays,
  FileText, Boxes, Megaphone, Bell, Sparkles, Skull, Crosshair, UserPlus, Map, ScrollText, BarChart3, Moon, type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number };
export type NavGroup = { title: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    title: "Pilotage",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/statistiques", label: "Statistiques", icon: BarChart3 },
      { href: "/assistant", label: "Assistant IA", icon: Sparkles },
      { href: "/finances", label: "Finances", icon: LineChart },
      { href: "/operations", label: "Opérations & Contrats", icon: Target },
      { href: "/renseignement", label: "Renseignement", icon: Eye },
      { href: "/wanted", label: "Avis de recherche", icon: Skull },
      { href: "/membres", label: "Membres & RH", icon: Users },
      { href: "/absences", label: "Absences", icon: Moon },
      { href: "/recrutement", label: "Recrutement", icon: UserPlus },
    ],
  },
  {
    title: "Terrain",
    items: [
      { href: "/medical", label: "Médical", icon: HeartPulse },
      { href: "/agenda", label: "Agenda & Clients", icon: CalendarDays },
      { href: "/documents", label: "Documents", icon: FileText },
      { href: "/inventaire", label: "Inventaire", icon: Boxes },
      { href: "/armurerie", label: "Armurerie de Van Horn", icon: Crosshair },
      { href: "/carte", label: "Carte interactive", icon: Map },
      { href: "/communication", label: "Communication", icon: Megaphone },
    ],
  },
  {
    title: "Direction",
    items: [
      { href: "/journal", label: "Journal de bord", icon: ScrollText },
      { href: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
];

export type Pole = "iwc" | "confrerie";

// Profil par défaut affiché tant qu'aucun compte Discord n'est connecté.
export const ME = { nom: "Jonas Caverly", initiales: "JC", role: "Fondateur", avatarUrl: null as string | null };
