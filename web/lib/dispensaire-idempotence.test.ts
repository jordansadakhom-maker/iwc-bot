import { describe, it, expect } from "vitest";
import { idAvecJeton, estDoublon } from "./dispensaire-idempotence";

describe("idAvecJeton — id déterministe depuis un jeton client", () => {
  const rnd = () => "ALEATOIRE";
  it("dérive un id stable du jeton (préfixe + jeton nettoyé)", () => {
    expect(idAvecJeton("dv", "abc-123", rnd)).toBe("dv-abc-123");
    // Même jeton → même id (base de l'idempotence).
    expect(idAvecJeton("dv", "abc-123", rnd)).toBe("dv-abc-123");
  });
  it("retombe sur l'aléatoire sans jeton ou jeton vide", () => {
    expect(idAvecJeton("dv", undefined, rnd)).toBe("ALEATOIRE");
    expect(idAvecJeton("dv", "", rnd)).toBe("ALEATOIRE");
    expect(idAvecJeton("dv", 42, rnd)).toBe("ALEATOIRE");
  });
  it("nettoie les caractères non sûrs et borne la longueur", () => {
    expect(idAvecJeton("dv", "a b/c*d", rnd)).toBe("dv-abcd");
    expect(idAvecJeton("dv", "x".repeat(200), rnd)).toBe("dv-" + "x".repeat(64));
  });
});

describe("estDoublon — détection d'une violation d'unicité", () => {
  it("reconnaît le code 23505", () => {
    expect(estDoublon({ code: "23505" })).toBe(true);
  });
  it("reconnaît les messages usuels", () => {
    expect(estDoublon({ message: "duplicate key value violates unique constraint" })).toBe(true);
    expect(estDoublon({ message: "row already exists" })).toBe(true);
  });
  it("ignore les autres erreurs et l'absence d'erreur", () => {
    expect(estDoublon({ message: "network error", code: "500" })).toBe(false);
    expect(estDoublon(null)).toBe(false);
    expect(estDoublon(undefined)).toBe(false);
  });
});
