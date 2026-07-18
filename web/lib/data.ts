/**
 * Navigation + profil connecté.
 *
 * ⚠️ AUCUNE donnée métier inventée ici. Les vraies valeurs (coffres, contrats,
 * opérations, transactions…) sont lues depuis Supabase — voir `lib/queries.ts`,
 * alimenté par le bot Discord via `supabase-sync.js`.
 */
import {
  LayoutDashboard, LineChart, Target, Eye, Users, HeartPulse, CalendarDays,
  FileText, Boxes, Megaphone, Bell, ShieldCheck, type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number };
export type NavGroup = { title: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    title: "Pilotage",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/finances", label: "Finances", icon: LineChart },
      { href: "/operations", label: "Opérations & Contrats", icon: Target },
      { href: "/renseignement", label: "Renseignement", icon: Eye },
      { href: "/membres", label: "Membres & RH", icon: Users },
    ],
  },
  {
    title: "Terrain",
    items: [
      { href: "/medical", label: "Médical", icon: HeartPulse },
      { href: "/agenda", label: "Agenda & Clients", icon: CalendarDays },
      { href: "/documents", label: "Documents", icon: FileText },
      { href: "/inventaire", label: "Inventaire", icon: Boxes },
      { href: "/communication", label: "Communication", icon: Megaphone },
    ],
  },
  {
    title: "Direction",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/administration", label: "Administration", icon: ShieldCheck },
    ],
  },
];

export type Pole = "iwc" | "confrerie";

// Le profil connecté (réel) — remplacé par le compte Discord à la connexion en Phase 1.
export const ME = { nom: "Jonas Caverly", initiales: "JC", role: "Fondateur" };
