import { describe, it, expect } from "vitest";
import { cleNom } from "./noms";

// Clé d'appariement des noms (source unique). Les mêmes personnes doivent donner
// la MÊME clé quelles que soient casse, accents, espaces et ponctuation — sinon
// doublons de patients / trous de sécurité (renvoyé qui « ne matche pas »).
describe("cleNom — clé de rapprochement", () => {
  it("ignore la casse", () => {
    expect(cleNom("LEA DARCY")).toBe(cleNom("lea darcy"));
  });
  it("ignore accents, espaces et ponctuation", () => {
    expect(cleNom("Léa D'Arcy")).toBe("leadarcy");
    expect(cleNom("LEA-DARCY")).toBe("leadarcy");
    expect(cleNom("  lea   darcy  ")).toBe("leadarcy");
  });
  it("déburre tous les accents courants", () => {
    expect(cleNom("Éàûöçè")).toBe("eauoce");
    expect(cleNom("Jean-Éric")).toBe("jeaneric");
  });
  it("tolère null / undefined / nombres", () => {
    expect(cleNom(null)).toBe("");
    expect(cleNom(undefined)).toBe("");
    expect(cleNom(123)).toBe("123");
  });
  it("deux écritures du même nom donnent la même clé", () => {
    expect(cleNom("Sean O'Brien")).toBe(cleNom("sean obrien"));
    expect(cleNom("Sean O'Brien")).toBe("seanobrien");
  });
});
