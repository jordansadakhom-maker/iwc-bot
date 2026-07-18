/**
 * Navigation + jeux de données.
 *
 * ⚠️ AUCUNE donnée inventée ici (pas de faux contrat, faux montant, fausse
 * opération). Les vraies valeurs viendront de la base partagée avec le bot
 * Discord (coffres, contrats, opérations, transactions…) une fois la Phase 1
 * branchée. Tant que `CONNECTE` est `false`, le tableau de bord affiche des
 * états « en attente » plutôt que des chiffres fictifs.
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

// Passe à `true` en Phase 1 quand la base réelle (Supabase, alimentée par le bot) est branchée.
export const CONNECTE = false;

// KPI : libellés uniquement — les valeurs viendront de la base.
export const KPIS = [
  { key: "coffre", label: "Coffre commun" },
  { key: "conf", label: "Coffre Confrérie" },
  { key: "contrats", label: "Contrats en cours" },
  { key: "ops", label: "Opérations actives" },
] as const;

// Séries/listes VIDES tant que la base n'est pas connectée (aucune donnée fictive).
export const TRESORERIE: { jour: number; solde: number }[] = [];

export type Severity = "crit" | "warn" | "info";
export const ATTENTION: { titre: string; detail: string; tag: string; sev: Severity }[] = [];

export const OPERATIONS: {
  preparation: { titre: string; type: string; etape: string; membres: string[] }[];
  encours: { titre: string; type: string; etape: string; membres: string[] }[];
  terminees: { titre: string; type: string; etape: string; membres: string[] }[];
} = { preparation: [], encours: [], terminees: [] };

export const NOTIFS: { titre: string; tag: string; quand: string; unread: boolean }[] = [];

// Le profil connecté (réel) — remplacé par le compte Discord à la connexion en Phase 1.
export const ME = { nom: "Jonas Caverly", initiales: "JC", role: "Fondateur" };
