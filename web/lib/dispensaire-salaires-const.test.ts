import { describe, it, expect } from "vitest";
import { calculerSalaire, salairePlein, SEUIL_JOURS_PLEIN } from "./dispensaire-salaires-const";

describe("calculerSalaire — 4 jours pointés = salaire plein", () => {
  const M = 1000; // barème plein hebdo

  it("suit exactement l'exemple du cahier des charges (barème 1000)", () => {
    expect(calculerSalaire(M, 0)).toBe(0);
    expect(calculerSalaire(M, 1)).toBe(250); // partiel
    expect(calculerSalaire(M, 2)).toBe(500); // partiel
    expect(calculerSalaire(M, 3)).toBe(750); // partiel
    expect(calculerSalaire(M, 4)).toBe(1000); // complet
    expect(calculerSalaire(M, 5)).toBe(1000); // complet (plafonné)
    expect(calculerSalaire(M, 6)).toBe(1000);
    expect(calculerSalaire(M, 7)).toBe(1000);
  });

  it("plafonne au plein dès le seuil, quel que soit le barème", () => {
    expect(calculerSalaire(840, 4)).toBe(840);
    expect(calculerSalaire(840, 7)).toBe(840);
    expect(calculerSalaire(840, 2)).toBe(420);
  });

  it("renvoie 0 pour un barème ou des jours nuls/invalides", () => {
    expect(calculerSalaire(0, 5)).toBe(0);
    expect(calculerSalaire(1000, 0)).toBe(0);
    expect(calculerSalaire(-500, 4)).toBe(0);
    expect(calculerSalaire(1000, -3)).toBe(0);
    expect(calculerSalaire(NaN, NaN)).toBe(0);
  });

  it("ignore les fractions de jour (jours entiers pointés)", () => {
    expect(calculerSalaire(1000, 3.9)).toBe(750); // compte 3 jours
  });

  it("salairePlein reflète le seuil", () => {
    expect(SEUIL_JOURS_PLEIN).toBe(4);
    expect(salairePlein(3)).toBe(false);
    expect(salairePlein(4)).toBe(true);
    expect(salairePlein(9)).toBe(true);
  });
});
