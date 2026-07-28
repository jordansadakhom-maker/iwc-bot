// Carte métier — cartographie des fonctions de la compagnie.
// Dérivation PURE (testable) : à partir du grade + fiche RH, on déduit les
// « métiers » qu'occupe chaque membre, puis on mesure la couverture de chacun.
// La règle de dérivation vit désormais dans lib/roles.ts (source unique partagée
// avec les accès) ; ce module se concentre sur la CARTOGRAPHIE (couverture d'équipe).

import { metiersDe as metiersDeRole } from "@/lib/roles";

export type MetierDef = { key: string; label: string; description: string };

// Catalogue ordonné (du pilotage au terrain).
export const METIERS: MetierDef[] = [
  { key: "direction", label: "Direction", description: "Pilotage & décisions" },
  { key: "officier", label: "Officiers", description: "Encadrement du terrain" },
  { key: "instruction", label: "Instruction", description: "Formation des recrues" },
  { key: "medecine", label: "Médecine", description: "Dispensaire & soins" },
  { key: "armurerie", label: "Armurerie", description: "Van Horn — production & ventes" },
  { key: "terrain", label: "Terrain", description: "Opérations & missions" },
];

export type MembreCarte = { nom: string; grade: string | null; statut: string; medecin: boolean; specialite: string | null; armurierRoster?: boolean };
export type MembrePuce = { nom: string; grade: string | null; absent: boolean };
export type Couverture = "ok" | "fragile" | "vide"; // fragile = présent(s) 0 mais des membres existent
export type MetierStat = MetierDef & { total: number; presents: number; absents: number; membres: MembrePuce[]; couverture: Couverture };
export type Cartographie = { metiers: MetierStat[]; nonClasses: MembrePuce[]; total: number };

// Métiers d'un membre (peut en cumuler plusieurs). Délègue à la source unique
// lib/roles.ts (même vocabulaire que getAcces), en propageant l'appartenance au
// roster de l'Armurerie quand elle est connue.
export function metiersDe(m: MembreCarte): string[] {
  return metiersDeRole(m);
}

export function cartographier(membres: MembreCarte[]): Cartographie {
  const actifs = membres.filter((m) => String(m.statut ?? "") !== "parti");
  const puce = (m: MembreCarte): MembrePuce => ({ nom: m.nom, grade: m.grade, absent: String(m.statut ?? "") === "absent" });
  const triPuces = (a: MembrePuce, b: MembrePuce) => Number(a.absent) - Number(b.absent) || a.nom.localeCompare(b.nom);

  const metiers: MetierStat[] = METIERS.map((def) => {
    const membresM = actifs.filter((m) => metiersDe(m).includes(def.key)).map(puce).sort(triPuces);
    const presents = membresM.filter((m) => !m.absent).length;
    const absents = membresM.length - presents;
    const couverture: Couverture = membresM.length === 0 ? "vide" : presents === 0 ? "fragile" : "ok";
    return { ...def, total: membresM.length, presents, absents, membres: membresM, couverture };
  });

  const nonClasses = actifs.filter((m) => metiersDe(m).length === 0).map(puce).sort(triPuces);
  return { metiers, nonClasses, total: actifs.length };
}
