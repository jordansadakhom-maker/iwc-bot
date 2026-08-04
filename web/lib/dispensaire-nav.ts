import { LayoutDashboard, Users, ClipboardList, Boxes, Warehouse, Archive, BadgeDollarSign, Receipt, ShieldCheck, FileText, BookUser, Stethoscope, ScrollText, BarChart3, History, ShieldAlert, Sparkles, Scale, HeartPulse, CalendarClock, Scissors, Landmark, BedDouble, Gauge, Coins, Crown, type LucideIcon } from "lucide-react";

// Onglets de la section Dispensaire de Saint-Denis.
//   `pret`       = déjà construit (sinon « bientôt »).
//   `restreint`  = réservé aux membres habilités (RH / chefs).
//   `direction`  = outil de l'espace Direction (protégé, regroupé dans la
//                  catégorie Direction) ; `perm` = permission requise.
//   `cat`        = catégorie du menu (regroupement par domaine). Les onglets
//                  `direction` appartiennent d'office à la catégorie Direction.
//   Sans `cat` ni `direction` → accès direct en tête de menu (Tableau de bord).
export type DispPerm = "admin" | "rh" | "factures";
export type DispCatKey = "medical" | "rh" | "direction" | "ressources";
export type DispTab = { href: string; label: string; icon: LucideIcon; pret?: boolean; restreint?: boolean; direction?: boolean; perm?: DispPerm; cat?: DispCatKey; desc?: string };

export const DISP_NAV: DispTab[] = [
  // ── Accès direct ──
  { href: "/dispensaire", label: "Tableau de bord", icon: LayoutDashboard, pret: true, desc: "Le registre du jour — soins, stocks et personnel réunis d'un même regard." },

  // ── 🏥 Gestion médicale ──
  { href: "/dispensaire/rendez-vous", label: "Rendez-vous", icon: CalendarClock, pret: true, cat: "medical", desc: "Le planning des consultations — patients attendus, praticiens, spécialités et salles." },
  { href: "/dispensaire/interventions", label: "Interventions", icon: Scissors, pret: true, restreint: true, cat: "medical", desc: "Les opérations et leurs comptes-rendus opératoires (CRO)." },
  { href: "/dispensaire/chambres", label: "Chambres", icon: BedDouble, pret: true, cat: "medical", desc: "Les lits et chambres — occupation, réservation, nettoyage." },
  { href: "/dispensaire/fdo", label: "Soins FDO", icon: ShieldCheck, pret: true, cat: "medical", desc: "Soins aux forces de l'ordre — suivi hebdomadaire & remboursement État." },
  { href: "/dispensaire/certificats", label: "Certificats", icon: Stethoscope, pret: true, cat: "medical", desc: "Certificats médicaux, prêts à sceller et à imprimer." },
  { href: "/dispensaire/rapports", label: "Rapports médicaux", icon: ScrollText, pret: true, cat: "medical", desc: "Comptes rendus et planches d'examen." },
  { href: "/dispensaire/ventes", label: "Ventes", icon: BadgeDollarSign, pret: true, cat: "medical", desc: "Le cahier des soins délivrés, patient par patient." },
  { href: "/dispensaire/frais", label: "Notes de frais", icon: FileText, pret: true, cat: "medical", desc: "Dépenses avancées, en attente de remboursement." },
  { href: "/dispensaire/factures", label: "Factures en retard", icon: Receipt, pret: true, restreint: true, cat: "medical", desc: "Les créances impayées et l'état de leur relance." },
  { href: "/dispensaire/coffres", label: "Stock Matériel Médical", icon: Archive, pret: true, cat: "medical", desc: "Le matériel médical rangé, coffre par coffre — et ce qu'il faut réapprovisionner." },
  { href: "/dispensaire/inventaire", label: "Inventaire global", icon: Warehouse, pret: true, cat: "medical", desc: "Vue d'ensemble en lecture seule — quantité totale de chaque produit, tous coffres confondus." },
  { href: "/dispensaire/stockage", label: "Stockage", icon: Boxes, pret: true, cat: "medical", desc: "L'inventaire des coffres — remèdes, matériel et matières." },

  // ── 👥 Ressources humaines (habilité RH) ──
  { href: "/dispensaire/pointage", label: "Pointage", icon: ClipboardList, pret: true, restreint: true, cat: "rh", desc: "Assiduité, absences et validation des services (la prise de service reste sur le tableau de bord)." },
  { href: "/dispensaire/rh", label: "Effectifs", icon: Users, pret: true, restreint: true, cat: "rh", desc: "Le personnel du dispensaire, ses fonctions, ses états de service et sa discipline." },

  // ── 📊 Direction (protégé) ──
  { href: "/dispensaire/cockpit", label: "Cockpit Direction", icon: LayoutDashboard, pret: true, direction: true, perm: "admin", desc: "La vue d'ensemble en temps réel — soins, planning, stock et finances d'un même regard." },
  { href: "/dispensaire/salaires", label: "Salaires", icon: Coins, pret: true, direction: true, perm: "admin", desc: "Calcul automatique des salaires — 4 jours pointés = salaire plein." },
  { href: "/dispensaire/comptabilite", label: "Comptabilité", icon: Landmark, pret: true, direction: true, perm: "factures", desc: "Trésorerie, recettes, dépenses et grand-livre — reconstruits automatiquement." },
  { href: "/dispensaire/assistant", label: "Assistant", icon: Sparkles, pret: true, direction: true, perm: "admin", desc: "La veille automatique — ce que le dispensaire a détecté et ce qu'il propose de faire." },
  { href: "/dispensaire/stats", label: "Statistiques", icon: BarChart3, pret: true, direction: true, perm: "admin", desc: "L'activité de l'officine en chiffres et en courbes." },
  { href: "/dispensaire/audit", label: "Mode Audit", icon: Gauge, pret: true, direction: true, perm: "admin", desc: "Le contrôle qualité — anomalies, cohérence des données et checklist de tests." },
  { href: "/dispensaire/admin", label: "Administration", icon: ShieldAlert, pret: true, direction: true, perm: "admin", desc: "Rôles, habilitations, paramètres avancés et journal d'accès du dispensaire." },

  // ── Ressources (utilitaires, ouvert) ──
  { href: "/repertoire", label: "Répertoire", icon: BookUser, pret: true, cat: "ressources", desc: "Les contacts et correspondants du dispensaire." },
  { href: "/dispensaire/reglement", label: "Règlement", icon: Scale, pret: true, cat: "ressources", desc: "Le règlement du cabinet et ses avenants — à connaître de tous." },
  { href: "/dispensaire/historique", label: "Historique", icon: History, pret: true, cat: "ressources", desc: "La main courante — tout ce qui a été porté au registre." },
];

// ── Catégories du menu (regroupement par domaine) ───────────────────────────
export type DispCategorie = { key: DispCatKey; label: string; icon: LucideIcon; direction?: boolean };
export const DISP_CATEGORIES: DispCategorie[] = [
  { key: "medical", label: "Gestion médicale", icon: HeartPulse },
  { key: "rh", label: "Ressources humaines", icon: Users },
  { key: "direction", label: "Direction", icon: Crown, direction: true },
  { key: "ressources", label: "Ressources", icon: BookUser },
];

// Onglets d'accès direct (ni catégorie, ni Direction) : Tableau de bord.
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
