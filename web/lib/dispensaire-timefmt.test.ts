import { describe, it, expect } from "vitest";
import { jourRelatif, tempsRelatif, heureCourte } from "@/lib/dispensaire-timefmt";

// Garde-fou anti-régression : une date invalide ne doit JAMAIS lever d'exception
// (sinon la timeline / la main courante font planter le rendu serveur → page 500).
describe("dispensaire-timefmt — tolérance aux dates invalides", () => {
  const invalides = ["", "null", "pas-une-date", "0000-00-00", "31/02/2026", "undefined"];

  it("jourRelatif ne lève jamais et replie sur « Plus tôt »", () => {
    for (const v of invalides) {
      expect(() => jourRelatif(v)).not.toThrow();
      expect(jourRelatif(v)).toBe("Plus tôt");
    }
  });

  it("tempsRelatif ne lève jamais et replie sur « — »", () => {
    for (const v of invalides) {
      expect(() => tempsRelatif(v, 1_700_000_000_000)).not.toThrow();
      expect(tempsRelatif(v, 1_700_000_000_000)).toBe("—");
    }
  });

  it("heureCourte ne lève jamais et replie sur « — »", () => {
    for (const v of invalides) {
      expect(() => heureCourte(v)).not.toThrow();
      expect(heureCourte(v)).toBe("—");
    }
  });
});

describe("dispensaire-timefmt — dates valides", () => {
  const now = new Date("2026-07-30T12:00:00Z");

  it("jourRelatif reconnaît aujourd'hui / hier", () => {
    expect(jourRelatif("2026-07-30T08:00:00Z", now)).toBe("Aujourd'hui");
    expect(jourRelatif("2026-07-29T08:00:00Z", now)).toBe("Hier");
    expect(jourRelatif("2026-07-20T08:00:00Z", now)).not.toBe("Plus tôt");
  });

  it("tempsRelatif exprime l'écart", () => {
    const base = new Date("2026-07-30T12:00:00Z").getTime();
    expect(tempsRelatif("2026-07-30T11:59:50Z", base)).toBe("à l'instant");
    expect(tempsRelatif("2026-07-30T11:50:00Z", base)).toBe("il y a 10 min");
    expect(tempsRelatif("2026-07-30T09:00:00Z", base)).toBe("il y a 3 h");
  });

  it("heureCourte formate une heure", () => {
    expect(heureCourte("2026-07-30T12:00:00Z")).toMatch(/\d{2}:\d{2}/);
  });
});
