import { LayoutDashboard, Users, ClipboardList, Boxes, FlaskConical, Archive, BadgeDollarSign, Receipt, ShieldCheck, FileText, BookUser, Stethoscope, ScrollText, BarChart3, History, ShieldAlert, Sparkles, Scale, HeartPulse, CalendarClock, Scissors, Landmark, BedDouble, Truck, Gauge, Coins, Crown, type LucideIcon } from "lucide-react";

// Onglets de la section Dispensaire de Saint-Denis.
//   `pret`       = déjà construit (sinon « bientôt »).
//   `restreint`  = réservé aux membres habilités (RH/chefs).
//   `direction`  = outil de l'espace Direction (protégé, regroupé dans la
//                  catégorie Direction) ; `perm` = permission requise.
//   `cat`        = catégorie du menu (regroupement par fonction). Les onglets
//                  `direction` appartiennent d'office à la catégorie Direction.
//   Sans `cat` ni `direction` → accès direct en tête de menu (Accueil, Assistant).
export type DispPerm = "admin" | "rh" | "factures";
export type DispCatKey = "soins" | "stock" | "administratif" | "direction" | "ressources";
export type DispTab = { href: string; label: string; icon: LucideIcon; pret?: boolean; restreint?: boolean; direction?: boolean; perm?: DispPerm; cat?: DispCatKey; desc?: string };

export const DISP_NAV: DispTab[] = [
  // ── Accès direct (hors catégories) ──
  { href: "/dispensaire", label: "Accueil", icon: LayoutDashboard, pret: true, desc: "Le registre du jour — soins, stocks et personnel réunis d'un même regard." },
  { href: "/dispensaire/assistant", label: "Assistant", icon: Sparkles, pret: true, desc: "La veille automatique — ce que le dispensaire a détecté et ce qu'il te propose de faire." },

  // ── Soins ──
  { href: "/dispensaire/rendez-vous", label: "Rendez-vous", icon: CalendarClock, pret: true, cat: "soins", desc: "Le planning des consultations — patients attendus, praticiens, spécialités et salles." },
  { href: "/dispensaire/interventions", label: "Interventions", icon: Scissors, pret: true, restreint: true, cat: "soins", desc: "Les opérations et leurs comptes-rendus opératoires (CRO)." },
  { href: "/dispensaire/chambres", label: "Chambres", icon: BedDouble, pret: true, cat: "soins", desc: "Les lits et chambres — occupation, réservation, nettoyage." },
  { href: "/dispensaire/ambulances", label: "Ambulances", icon: Truck, pret: true, cat: "soins", desc: "La flotte d'intervention — état, carburant, entretien et matériel." },

  // ── Stock ──
  { href: "/dispensaire/stockage", label: "Stockage", icon: Boxes, pret: true, cat: "stock", desc: "L'inventaire des coffres — remèdes, matériel et matières." },
  { href: "/dispensaire/coffres", label: "Stock Matériel Médical", icon: Archive, pret: true, cat: "stock", desc: "Le matériel médical rangé, coffre par coffre — et ce qu'il faut réapprovisionner." },
  { href: "/dispensaire/matieres", label: "Matières premières", icon: FlaskConical, pret: true, cat: "stock", desc: "Ce qu'il faut réapprovisionner pour tenir l'officine." },

  // ── Administratif ──
  { href: "/dispensaire/ventes", label: "Ventes", icon: BadgeDollarSign, pret: true, cat: "administratif", desc: "Le cahier des soins délivrés, patient par patient." },
  { href: "/dispensaire/pointage", label: "Pointage", icon: ClipboardList, pret: true, cat: "administratif", desc: "Prises et fins de service, absences et assiduité sur trois semaines." },
  { href: "/dispensaire/fdo", label: "Soins FDO", icon: ShieldCheck, pret: true, cat: "administratif", desc: "Soins portés aux forces de l'ordre du comté." },
  { href: "/dispensaire/frais", label: "Notes de frais", icon: FileText, pret: true, cat: "administratif", desc: "Dépenses avancées, en attente de remboursement." },
  { href: "/dispensaire/certificats", label: "Certificats", icon: Stethoscope, pret: true, cat: "administratif", desc: "Certificats médicaux, prêts à sceller et à imprimer." },
  { href: "/dispensaire/rapports", label: "Rapports médicaux", icon: ScrollText, pret: true, cat: "administratif", desc: "Comptes rendus et planches d'examen." },

  // ── Direction (protégé) ──
  { href: "/dispensaire/cockpit", label: "Cockpit Direction", icon: LayoutDashboard, pret: true, direction: true, perm: "admin", desc: "La vue d'ensemble en temps réel — soins, planning, stock et finances d'un même regard." },
  { href: "/dispensaire/rh", label: "RH / Salariés", icon: Users, pret: true, direction: true, perm: "rh", desc: "Le personnel du dispensaire, ses fonctions, ses états de service et sa discipline." },
  { href: "/dispensaire/salaires", label: "Salaires", icon: Coins, pret: true, direction: true, perm: "admin", desc: "Calcul automatique des salaires — 4 jours pointés = salaire plein." },
  { href: "/dispensaire/comptabilite", label: "Comptabilité", icon: Landmark, pret: true, direction: true, perm: "factures", desc: "Trésorerie, recettes, dépenses et grand-livre — reconstruits automatiquement." },
  { href: "/dispensaire/factures", label: "Factures en retard", icon: Receipt, pret: true, direction: true, perm: "factures", desc: "Les créances impayées et l'état de leur relance." },
  { href: "/dispensaire/stats", label: "Statistiques", icon: BarChart3, pret: true, direction: true, perm: "admin", desc: "L'activité de l'officine en chiffres et en courbes." },
  { href: "/dispensaire/audit", label: "Mode Audit", icon: Gauge, pret: true, direction: true, perm: "admin", desc: "Le contrôle qualité — anomalies, cohérence des données et checklist de tests." },
  { href: "/dispensaire/admin", label: "Administration", icon: ShieldAlert, pret: true, direction: true, perm: "admin", desc: "Rôles, habilitations, journal d'accès et réglages du dispensaire." },

  // ── Ressources ──
  { href: "/repertoire", label: "Répertoire", icon: BookUser, pret: true, cat: "ressources", desc: "Les contacts et correspondants du dispensaire." },
  { href: "/dispensaire/reglement", label: "Règlement", icon: Scale, pret: true, cat: "ressources", desc: "Le règlement du cabinet et ses avenants — à connaître de tous." },
  { href: "/dispensaire/historique", label: "Historique", icon: History, pret: true, cat: "ressources", desc: "La main courante — tout ce qui a été porté au registre." },
];

// ── Catégories du menu (regroupement par fonction) ──────────────────────────
export type DispCategorie = { key: DispCatKey; label: string; icon: LucideIcon; direction?: boolean };
export const DISP_CATEGORIES: DispCategorie[] = [
  { key: "soins", label: "Soins", icon: HeartPulse },
  { key: "stock", label: "Stock", icon: Boxes },
  { key: "administratif", label: "Administratif", icon: FileText },
  { key: "direction", label: "Direction", icon: Crown, direction: true },
  { key: "ressources", label: "Ressources", icon: BookUser },
];

// Onglets d'accès direct (ni catégorie, ni Direction) : Accueil, Assistant.
export const DISP_DIRECT = DISP_NAV.filter((t) => !t.cat && !t.direction);
// Onglets d'une catégorie « normale » (hors Direction).
export const tabsDeCategorie = (key: DispCatKey): DispTab[] => DISP_NAV.filter((t) => t.cat === key);
// Outils regroupés dans l'espace Direction.
export const DISP_DIRECTION = DISP_NAV.filter((t) => t.direction);

// Un compte (via ses permissions) peut-il accéder à un outil Direction ? La
// Direction (`admin`) voit tout ; sinon, la permission exacte de l'outil est
// requise. Source de vérité UNIQUE, partagée par le hub, la garde de page et le
// menu — ajouter un outil = déclarer sa `perm`, rien d'autre.
export type PermsLike = { admin?: boolean; rh?: boolean; factures?: boolean };
export function aPermDirection(perms: PermsLike, p?: DispPerm): boolean {
  if (!p) return false;
  if (perms.admin) return true;
  if (p === "rh") return !!perms.rh;
  if (p === "factures") return !!perms.factures;
  return false; // "admin" sans le droit admin
}
// Le compte a-t-il accès à AU MOINS un outil Direction (⇒ voit la catégorie Direction) ?
export const aAccesDirection = (perms: PermsLike): boolean => DISP_DIRECTION.some((t) => aPermDirection(perms, t.perm));

// Routes hors barre d'onglets qui méritent tout de même un en-tête de folio.
export const DISP_EXTRA: Record<string, { label: string; desc: string }> = {
  "/dispensaire/recherche": { label: "Recherche globale", desc: "Fouiller tout le registre d'un seul mot." },
  "/dispensaire/notifications": { label: "Notifications", desc: "Les avis et rappels adressés au dispensaire." },
  "/dispensaire/direction": { label: "Direction", desc: "L'espace réservé à la Direction — pilotage, personnel, paie, comptabilité et réglages." },
};
