import { describe, it, expect } from "vitest";
import { estDirection, estOfficier, estArmurierGrade, metiersDe, normNom } from "./roles";

describe("prédicats de grade", () => {
  it("Direction reconnaît les grades de tête", () => {
    for (const g of ["Fondateur", "Le Conseil — Directeur", "Fléau", "Concepteur"]) expect(estDirection(g)).toBe(true);
    expect(estDirection("Officier de Terrain")).toBe(false);
    expect(estDirection(null)).toBe(false);
  });
  it("Officier inclut la Direction", () => {
    expect(estOfficier("Fondateur")).toBe(true);
    expect(estOfficier("Officier de Terrain")).toBe(true);
    expect(estOfficier("Instructeur")).toBe(true);
    expect(estOfficier("Agent Confirmé")).toBe(false);
  });
  it("Armurier (grade) = Direction ou « armur… »", () => {
    expect(estArmurierGrade("Armurier")).toBe(true);
    expect(estArmurierGrade("Fondateur")).toBe(true);
    expect(estArmurierGrade("Agent Confirmé")).toBe(false);
  });
});

describe("metiersDe", () => {
  it("cumule direction + officier pour un fondateur, sans terrain", () => {
    const r = metiersDe({ grade: "Fondateur" });
    expect(r).toEqual(expect.arrayContaining(["direction", "officier"]));
    expect(r).not.toContain("terrain");
  });
  it("médecine via flag RH ou spécialité", () => {
    expect(metiersDe({ medecin: true })).toContain("medecine");
    expect(metiersDe({ specialite: "Chirurgien" })).toContain("medecine");
  });
  it("armurerie via grade, spécialité OU roster", () => {
    expect(metiersDe({ grade: "Armurier" })).toContain("armurerie");
    expect(metiersDe({ specialite: "armurerie" })).toContain("armurerie");
    // Roster : grade neutre mais employé inscrit → toujours Armurerie (anti-désynchro).
    expect(metiersDe({ grade: "Agent Confirmé", armurierRoster: true })).toContain("armurerie");
    expect(metiersDe({ grade: "Agent Confirmé" })).not.toContain("armurerie");
  });
  it("grade inconnu = aucun métier", () => {
    expect(metiersDe({ grade: "Inconnu" })).toEqual([]);
  });
});

describe("normNom", () => {
  it("ignore accents, casse et séparateurs", () => {
    expect(normNom("Jérôme O'Neil")).toBe(normNom("jerome oneil"));
    expect(normNom("  Anne-Marie  ")).toBe("annemarie");
  });
});
