import { describe, it, expect } from "vitest";
import { normaliserPole, scorerCandidat, suggererAssignation, type CandidatMembre } from "./attribution";

const c = (over: Partial<CandidatMembre> = {}): CandidatMembre => ({
  id: "1", nom: "A", grade: null, pole: "", absent: false, charge: 0, ...over,
});

describe("normaliserPole", () => {
  it("mappe iwc→legal, confrerie→illegal, le reste→null", () => {
    expect(normaliserPole("iwc")).toBe("legal");
    expect(normaliserPole("legal")).toBe("legal");
    expect(normaliserPole("confrerie")).toBe("illegal");
    expect(normaliserPole("illegal")).toBe("illegal");
    expect(normaliserPole("both")).toBeNull();
    expect(normaliserPole(null)).toBeNull();
  });
});

describe("scorerCandidat", () => {
  it("un présent sans charge score plus qu'un chargé", () => {
    expect(scorerCandidat(c({ charge: 0 }), {}).score).toBeGreaterThan(scorerCandidat(c({ charge: 3 }), {}).score);
  });
  it("un absent est lourdement pénalisé", () => {
    expect(scorerCandidat(c({ absent: true }), {}).score).toBeLessThan(0);
    expect(scorerCandidat(c({ absent: true }), {}).raisons.join()).toMatch(/absent/i);
  });
  it("bonus si le pôle correspond, malus si pôle opposé", () => {
    const match = scorerCandidat(c({ pole: "legal" }), { pole: "iwc" }).score;
    const neutre = scorerCandidat(c({ pole: "both" }), { pole: "iwc" }).score;
    const oppose = scorerCandidat(c({ pole: "illegal" }), { pole: "iwc" }).score;
    expect(match).toBeGreaterThan(neutre);
    expect(oppose).toBeLessThan(neutre);
  });
});

describe("suggererAssignation", () => {
  it("classe présents/faible charge/pôle en tête et limite à n", () => {
    const cands = [
      c({ id: "absent", nom: "Absent", absent: true }),
      c({ id: "charge", nom: "Charge", charge: 5 }),
      c({ id: "ideal", nom: "Ideal", pole: "legal", charge: 0 }),
      c({ id: "libre", nom: "Libre", charge: 1 }),
    ];
    const out = suggererAssignation(cands, { pole: "iwc" }, 3);
    expect(out).toHaveLength(3);
    expect(out[0].id).toBe("ideal");
    expect(out.map((s) => s.id)).not.toContain("absent");
  });
  it("à score égal, la charge la plus faible d'abord", () => {
    const out = suggererAssignation([c({ id: "b", nom: "B", charge: 2 }), c({ id: "a", nom: "A", charge: 1 })], {});
    expect(out[0].id).toBe("a");
  });
});
