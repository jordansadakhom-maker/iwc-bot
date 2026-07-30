import { describe, it, expect } from "vitest";
import { estValide, estAConfirmer, estEscalade, statutDe } from "./dispensaire-pointage-const";

const T0 = Date.parse("2026-07-30T12:00:00Z");
const minutesAvant = (n: number) => new Date(T0 - n * 60000).toISOString();
const heuresAvant = (n: number) => new Date(T0 - n * 3600000).toISOString();

describe("pointage — jours validés (paie)", () => {
  it("un service ouvert n'est jamais payé", () => {
    expect(estValide({ fin: null })).toBe(false);
    expect(estValide({ fin: null, valide: true })).toBe(false);
  });
  it("un service clôturé est validé, sauf s'il est explicitement invalidé", () => {
    expect(estValide({ fin: heuresAvant(1) })).toBe(true);            // avant migration (valide absent)
    expect(estValide({ fin: heuresAvant(1), valide: true })).toBe(true);
    expect(estValide({ fin: heuresAvant(1), valide: false })).toBe(false);
  });
});

describe("pointage — détection d'oubli (à confirmer)", () => {
  it("service ouvert avec signal récent = pas à confirmer", () => {
    expect(estAConfirmer({ fin: null, debut: heuresAvant(3), lastSeen: minutesAvant(2) }, 10, T0)).toBe(false);
  });
  it("service ouvert sans signal depuis > seuil = à confirmer", () => {
    expect(estAConfirmer({ fin: null, debut: heuresAvant(3), lastSeen: minutesAvant(20) }, 10, T0)).toBe(true);
  });
  it("sans heartbeat, on se base sur le début", () => {
    expect(estAConfirmer({ fin: null, debut: minutesAvant(5) }, 10, T0)).toBe(false);
    expect(estAConfirmer({ fin: null, debut: minutesAvant(30) }, 10, T0)).toBe(true);
  });
  it("un service clôturé n'est jamais à confirmer", () => {
    expect(estAConfirmer({ fin: heuresAvant(1), debut: heuresAvant(3), lastSeen: heuresAvant(2) }, 10, T0)).toBe(false);
  });
});

describe("pointage — escalade Direction", () => {
  it("ouvert depuis plus que le seuil → remonte à la Direction", () => {
    expect(estEscalade({ fin: null, debut: heuresAvant(25) }, 24, T0)).toBe(true);
    expect(estEscalade({ fin: null, debut: heuresAvant(2) }, 24, T0)).toBe(false);
    expect(estEscalade({ fin: heuresAvant(48), debut: heuresAvant(50) }, 24, T0)).toBe(false); // clôturé
  });
});

describe("pointage — statut affiché", () => {
  it("dérive le bon statut", () => {
    expect(statutDe({ fin: null, debut: minutesAvant(2), lastSeen: minutesAvant(1) }, 10, T0)).toBe("en_service");
    expect(statutDe({ fin: null, debut: heuresAvant(5), lastSeen: minutesAvant(30) }, 10, T0)).toBe("a_confirmer");
    expect(statutDe({ fin: heuresAvant(1), debut: heuresAvant(3), finSource: "normal" }, 10, T0)).toBe("normal");
    expect(statutDe({ fin: heuresAvant(1), debut: heuresAvant(3), finSource: "oubli" }, 10, T0)).toBe("oubli");
    expect(statutDe({ fin: heuresAvant(1), debut: heuresAvant(3), finSource: "direction" }, 10, T0)).toBe("direction");
    expect(statutDe({ fin: heuresAvant(1), debut: heuresAvant(3) }, 10, T0)).toBe("normal"); // défaut
  });
});
