import { describe, it, expect } from "vitest";
import { metiersDe, cartographier, type MembreCarte } from "./carte-metier";

const m = (over: Partial<MembreCarte> = {}): MembreCarte => ({
  nom: "X", grade: null, statut: "actif", medecin: false, specialite: null, ...over,
});

describe("metiersDe", () => {
  it("un fondateur est Direction + Officier (pas Terrain)", () => {
    const r = metiersDe(m({ grade: "Fondateur" }));
    expect(r).toContain("direction");
    expect(r).toContain("officier");
    expect(r).not.toContain("terrain");
  });
  it("un officier de terrain est Officier + Terrain", () => {
    const r = metiersDe(m({ grade: "Officier de Terrain" }));
    expect(r).toContain("officier");
    expect(r).toContain("terrain");
  });
  it("la fiche RH médecin ou la spécialité déclenche Médecine", () => {
    expect(metiersDe(m({ medecin: true }))).toContain("medecine");
    expect(metiersDe(m({ specialite: "Chirurgien" }))).toContain("medecine");
  });
  it("l'armurerie vient du grade ou de la spécialité", () => {
    expect(metiersDe(m({ grade: "Armurier" }))).toContain("armurerie");
    expect(metiersDe(m({ specialite: "armurerie" }))).toContain("armurerie");
  });
  it("un grade inconnu ne renvoie aucun métier", () => {
    expect(metiersDe(m({ grade: "Inconnu" }))).toEqual([]);
  });
});

describe("cartographier", () => {
  it("ignore les partis, classe présents/absents et repère les métiers vides", () => {
    const carto = cartographier([
      m({ nom: "Chef", grade: "Fondateur" }),
      m({ nom: "AgentA", grade: "Agent Confirmé" }),
      m({ nom: "AgentB", grade: "Opérateur", statut: "absent" }),
      m({ nom: "Ancien", grade: "Agent Confirmé", statut: "parti" }),   // ignoré
    ]);
    expect(carto.total).toBe(3);
    const terrain = carto.metiers.find((x) => x.key === "terrain")!;
    expect(terrain.total).toBe(2);
    expect(terrain.presents).toBe(1);
    expect(terrain.absents).toBe(1);
    expect(terrain.membres[0].absent).toBe(false); // présents d'abord
    const medecine = carto.metiers.find((x) => x.key === "medecine")!;
    expect(medecine.couverture).toBe("vide");
  });
  it("liste les membres sans métier identifié", () => {
    const carto = cartographier([m({ nom: "Zeb", grade: "Inconnu" })]);
    expect(carto.nonClasses.map((x) => x.nom)).toContain("Zeb");
  });
});
