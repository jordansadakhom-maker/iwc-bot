/**
 * Données de démonstration + configuration de navigation.
 * En Phase 1, ces données proviendront de la base (Supabase/Prisma) selon le rôle et le pôle.
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
      { href: "/operations", label: "Opérations & Contrats", icon: Target, badge: 7 },
      { href: "/renseignement", label: "Renseignement", icon: Eye },
      { href: "/membres", label: "Membres & RH", icon: Users },
    ],
  },
  {
    title: "Terrain",
    items: [
      { href: "/medical", label: "Médical", icon: HeartPulse },
      { href: "/agenda", label: "Agenda & Clients", icon: CalendarDays, badge: 3 },
      { href: "/documents", label: "Documents", icon: FileText },
      { href: "/inventaire", label: "Inventaire", icon: Boxes },
      { href: "/communication", label: "Communication", icon: Megaphone },
    ],
  },
  {
    title: "Direction",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell, badge: 3 },
      { href: "/administration", label: "Administration", icon: ShieldCheck },
    ],
  },
];

export type Pole = "iwc" | "confrerie";

export const KPIS = [
  { key: "coffre", label: "Coffre commun", value: 48250, prefix: "$", delta: 12.4, up: true, spark: [14, 15, 14, 16, 18, 17, 19, 20, 19, 22, 24, 23, 26, 27] },
  { key: "conf", label: "Coffre Confrérie", value: 19800, prefix: "$", delta: 3.1, up: false, spark: [22, 21, 22, 20, 21, 19, 20, 18, 19, 18, 17, 18, 16, 17] },
  { key: "contrats", label: "Contrats en cours", value: 7, prefix: "", note: "2 cette semaine", up: true, spark: [3, 3, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 7] },
  { key: "ops", label: "Opérations actives", value: 3, prefix: "", note: "1 démarre aujourd'hui", up: true, spark: [1, 2, 2, 1, 2, 3, 2, 3, 3, 2, 3, 4, 3, 3] },
] as const;

// Trésorerie — 30 derniers jours (milliers $).
export const TRESORERIE = [
  26, 27, 26.5, 28, 29, 28.4, 30, 31, 30.2, 32, 33.5, 33, 34.6, 36, 35.4, 37,
  38.5, 38, 40, 41.5, 41, 43, 44.6, 44, 46, 47.5, 47, 48, 49.4, 48.25,
].map((solde, i) => ({ jour: i + 1, solde }));

export type Severity = "crit" | "warn" | "info";
export const ATTENTION: { titre: string; detail: string; tag: string; sev: Severity }[] = [
  { titre: "2 étapes d'opération à valider", detail: "Braquage de Valentine · Convoi Van Horn", tag: "Urgent", sev: "crit" },
  { titre: "Contrat #C-204 à encaisser", detail: "Protection — Rhodes · 3 000 $", tag: "Finance", sev: "warn" },
  { titre: "Demande de RDV médical", detail: "June McCall — motif : blessure par balle", tag: "Médical", sev: "info" },
  { titre: "Nouvelle candidature", detail: "« Silas Bram » — pôle illégal", tag: "Recrutement", sev: "info" },
];

export const OPERATIONS = {
  preparation: [
    { titre: "Manoir de Rhodes", type: "Vol organisé", etape: "étape 2/5", membres: ["CH", "JC"] },
    { titre: "Convoi de Van Horn", type: "Contrebande", etape: "étape 3/5", membres: ["TG"] },
  ],
  encours: [{ titre: "Braquage de Valentine", type: "Démarrée", etape: "étape 4/5", membres: ["JC", "JM", "CH"] }],
  terminees: [{ titre: "Contrebande Saint-Denis", type: "Archivée", etape: "+4 000 $", membres: [] }],
};

export const NOTIFS = [
  { titre: "Étape 3 validée — Braquage de Valentine", tag: "Direction", quand: "il y a 4 min", unread: true },
  { titre: "Nouveau contrat de mission créé", tag: "Confrérie", quand: "par Cyrus Hollow · 12 min", unread: true },
  { titre: "RDV honoré — client de Rhodes +250 $", tag: "Finances", quand: "26 min", unread: true },
  { titre: "June McCall a confirmé un renseignement", tag: "Renseignement", quand: "1 h", unread: false },
];

export const ME = { nom: "Jonas Caverly", initiales: "JC", role: "Fondateur" };
