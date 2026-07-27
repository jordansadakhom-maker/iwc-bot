import { describe, it, expect } from "vitest";
import { ymdParis, dowParis, lundiCourant } from "./dispensaire-dates";

// Repères : en juillet 2026 (heure d'été, Paris = UTC+2), le 20 est un lundi,
// le 26 un dimanche, le 27 un lundi.

describe("ymdParis — date civile Paris (YYYY-MM-DD)", () => {
  it("rend la date du fuseau Paris", () => {
    expect(ymdParis("2026-07-27T10:00:00Z")).toBe("2026-07-27");
  });
  it("bascule au bon jour après minuit heure de Paris", () => {
    // 23:30 UTC le 26 = 01:30 Paris le 27.
    expect(ymdParis("2026-07-26T23:30:00Z")).toBe("2026-07-27");
  });
  it("accepte aussi un objet Date", () => {
    expect(ymdParis(new Date("2026-07-27T10:00:00Z"))).toBe("2026-07-27");
  });
});

describe("dowParis — jour de semaine (0 = lundi)", () => {
  it("lundi = 0", () => { expect(dowParis("2026-07-27T10:00:00Z")).toBe(0); });
  it("dimanche = 6", () => { expect(dowParis("2026-07-26T10:00:00Z")).toBe(6); });
});

describe("lundiCourant — lundi de la semaine", () => {
  it("un lundi renvoie lui-même", () => {
    expect(lundiCourant("2026-07-27T10:00:00Z")).toBe("2026-07-27");
  });
  it("un dimanche renvoie le lundi précédent", () => {
    expect(lundiCourant("2026-07-26T10:00:00Z")).toBe("2026-07-20");
  });
  it("est stable quelle que soit l'heure de la journée", () => {
    expect(lundiCourant("2026-07-24T22:45:00Z")).toBe("2026-07-20"); // vendredi soir
  });
});
