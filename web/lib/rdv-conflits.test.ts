import { describe, it, expect } from "vitest";
import { chevauche, intervalleRdv, conflitsRdv, type RdvExistant } from "./rdv-conflits";

describe("chevauche", () => {
  it("détecte le chevauchement, ignore les intervalles disjoints/adjacents", () => {
    expect(chevauche(0, 10, 5, 15)).toBe(true);
    expect(chevauche(0, 10, 10, 20)).toBe(false); // adjacents (semi-ouverts)
    expect(chevauche(0, 10, 20, 30)).toBe(false);
    expect(chevauche(5, 15, 0, 10)).toBe(true);
  });
});

describe("intervalleRdv", () => {
  it("calcule [début, début+durée) et applique le défaut", () => {
    const i = intervalleRdv("2026-07-28T10:00:00Z", 60)!;
    expect(i.fin - i.debut).toBe(60 * 60000);
    const j = intervalleRdv("2026-07-28T10:00:00Z", null, 30)!;
    expect(j.fin - j.debut).toBe(30 * 60000);
    expect(intervalleRdv("pas une date", 30)).toBeNull();
  });
});

describe("conflitsRdv", () => {
  const base: RdvExistant[] = [
    { id: "a", debut: "2026-07-28T10:00:00Z", dureeMin: 60, medecin: "Dr House", salle: "Salle 1", etat: "prevu" },
  ];
  it("conflit si même médecin et chevauchement", () => {
    const c = conflitsRdv({ debut: "2026-07-28T10:30:00Z", dureeMin: 30, medecin: "Dr House", salle: "Salle 2" }, base);
    expect(c.map((x) => x.id)).toEqual(["a"]);
  });
  it("conflit si même salle et chevauchement", () => {
    const c = conflitsRdv({ debut: "2026-07-28T10:30:00Z", dureeMin: 30, medecin: "Dr Autre", salle: "Salle 1" }, base);
    expect(c.map((x) => x.id)).toEqual(["a"]);
  });
  it("pas de conflit si ressource différente", () => {
    expect(conflitsRdv({ debut: "2026-07-28T10:30:00Z", dureeMin: 30, medecin: "Dr Autre", salle: "Salle 9" }, base)).toEqual([]);
  });
  it("pas de conflit hors créneau", () => {
    expect(conflitsRdv({ debut: "2026-07-28T12:00:00Z", dureeMin: 30, medecin: "Dr House", salle: "Salle 1" }, base)).toEqual([]);
  });
  it("ignore les RDV annulés/terminés et soi-même", () => {
    const annule: RdvExistant[] = [{ ...base[0], etat: "annule" }];
    expect(conflitsRdv({ debut: "2026-07-28T10:30:00Z", dureeMin: 30, medecin: "Dr House", salle: "Salle 1" }, annule)).toEqual([]);
    expect(conflitsRdv({ debut: "2026-07-28T10:30:00Z", dureeMin: 30, medecin: "Dr House", salle: "Salle 1", excludeId: "a" }, base)).toEqual([]);
  });
});
