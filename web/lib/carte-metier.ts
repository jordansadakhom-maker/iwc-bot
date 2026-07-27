// Carte métier — cartographie des fonctions de la compagnie.
// Dérivation PURE (testable) : à partir du grade + fiche RH, on déduit les
// « métiers » qu'occupe chaque membre, puis on mesure la couverture de chacun.

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

export type MembreCarte = { nom: string; grade: string | null; statut: string; medecin: boolean; specialite: string | null };
export type MembrePuce = { nom: string; grade: string | null; absent: boolean };
export type Couverture = "ok" | "fragile" | "vide"; // fragile = présent(s) 0 mais des membres existent
export type MetierStat = MetierDef & { total: number; presents: number; absents: number; membres: MembrePuce[]; couverture: Couverture };
export type Cartographie = { metiers: MetierStat[]; nonClasses: MembrePuce[]; total: number };

// Métiers d'un membre (peut en cumuler plusieurs). Même vocabulaire que getAcces.
export function metiersDe(m: MembreCarte): string[] {
  const g = String(m.grade ?? "").toLowerCase();
  const spec = String(m.specialite ?? "").toLowerCase();
  const out = new Set<string>();
  const direction = /fondateur|conseil|directeur|fl[eé]au|concepteur/.test(g);
  const officier = direction || /officier|instructeur/.test(g);
  if (direction) out.add("direction");
  if (officier) out.add("officier");
  if (/instructeur/.test(g) || /instruct/.test(spec)) out.add("instruction");
  if (m.medecin || /m[eé]dec|infirm|docteur|toubib|chirurg/.test(spec)) out.add("medecine");
  if (/armur/.test(g) || /armur/.test(spec)) out.add("armurerie");
  if (/officier|agent|op[eé]rateur|recrue|terrain/.test(g)) out.add("terrain");
  return [...out];
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
