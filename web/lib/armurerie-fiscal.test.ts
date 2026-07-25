import { describe, it, expect } from "vitest";
import {
  GRILLE_FISCALE, SEUIL_MIN, SEUIL_MAX, trancheDe, calculFiscal, simulerFiscal,
  snapshotCycle, verifierCoherence, estMouvementImpot, debutCycle, round2, type MvtCoffre,
} from "./armurerie-fiscal";

// Batterie de tests du module fiscal (source unique de vérité). Couvre chaque
// tranche, les valeurs AUX seuils, juste en dessous/au-dessus, bénéfice nul,
// négatif, très gros, la simulation, la cohérence, et le cycle (flux du coffre).

describe("trancheDe & calculFiscal — chaque tranche", () => {
  const attendus: [number, number][] = [
    [0, 0], [1000, 0], [1799, 0],          // sous le premier seuil → 0 %
    [1800, 25], [2199, 25],                 // 25 %
    [2200, 30], [2399, 30],                 // 30 %
    [2400, 30.2], [2599, 30.2],             // 30,2 %
    [2600, 35], [2999, 35],                 // 35 %
    [3000, 40], [10000, 40], [999999, 40],  // 40 %
  ];
  for (const [benefice, taux] of attendus) {
    it(`bénéfice ${benefice} → ${taux} %`, () => {
      expect(calculFiscal(benefice).taux).toBe(taux);
    });
  }
});

describe("Valeurs EXACTEMENT aux seuils (bornes incluses)", () => {
  for (const t of GRILLE_FISCALE) {
    it(`${t.seuil} $ applique bien ${t.taux} %`, () => {
      const c = calculFiscal(t.seuil);
      expect(c.taux).toBe(t.taux);
      expect(c.seuilTranche).toBe(t.seuil);
      expect(c.impot).toBe(round2((t.seuil * t.taux) / 100));
      expect(c.net).toBe(round2(t.seuil - c.impot));
    });
    it(`${t.seuil - 1} $ reste dans la tranche inférieure`, () => {
      expect(calculFiscal(t.seuil - 1).taux).not.toBe(t.taux);
    });
  }
});

describe("Exemple officiel du cahier des charges", () => {
  it("2600 → tranche 35 %, impôt 910 $, net 1690 $", () => {
    const c = calculFiscal(2600);
    expect(c.taux).toBe(35);
    expect(c.impot).toBe(910);
    expect(c.net).toBe(1690);
  });
  it("2120 → encore 80 $ avant la tranche 2200 (progression 0.8)", () => {
    const c = calculFiscal(2120);
    expect(c.taux).toBe(25);
    expect(c.prochainSeuil).toBe(2200);
    expect(c.resteAvantProchain).toBe(80);
    expect(c.progression).toBeCloseTo(0.8, 5);
  });
});

describe("Bénéfices nul, négatif, très gros", () => {
  it("0 → aucun impôt", () => { const c = calculFiscal(0); expect(c.impot).toBe(0); expect(c.net).toBe(0); expect(c.taux).toBe(0); });
  it("négatif → aucun impôt, net négatif", () => { const c = calculFiscal(-500); expect(c.impot).toBe(0); expect(c.net).toBe(-500); expect(c.taux).toBe(0); });
  it("très gros → 40 % et jamais au-delà", () => {
    const c = calculFiscal(1_000_000);
    expect(c.taux).toBe(SEUIL_MAX ? 40 : 40);
    expect(c.impot).toBe(400_000);
    expect(c.prochainSeuil).toBeNull();
    expect(c.progression).toBe(1);
  });
});

describe("Progression & prochain palier", () => {
  it("sous 1800 : progresse vers 1800", () => {
    const c = calculFiscal(900);
    expect(c.prochainSeuil).toBe(SEUIL_MIN);
    expect(c.progression).toBeCloseTo(0.5, 5);
  });
  it("au max : pas de prochain palier", () => {
    const c = calculFiscal(5000);
    expect(c.prochainSeuil).toBeNull();
    expect(c.resteAvantProchain).toBeNull();
  });
});

describe("Simulateur — impact d'une vente avant validation", () => {
  it("une vente qui fait franchir une tranche est signalée", () => {
    const sim = simulerFiscal(2150, 100); // 2150 (25 %) → 2250 (30 %)
    expect(sim.changeTranche).toBe(true);
    expect(sim.projete.taux).toBe(30);
    expect(sim.deltaImpot).toBeGreaterThan(0);
  });
  it("une vente qui ne change pas de tranche", () => {
    const sim = simulerFiscal(1850, 50); // reste en 25 %
    expect(sim.changeTranche).toBe(false);
    expect(sim.projete.taux).toBe(25);
  });
});

describe("Contrôle de cohérence automatique", () => {
  it("un calcul correct ne lève aucune anomalie", () => {
    expect(verifierCoherence(calculFiscal(2600))).toHaveLength(0);
  });
  it("un impôt falsifié est détecté", () => {
    const c = { ...calculFiscal(2600), impot: 500, net: 2100 };
    expect(verifierCoherence(c).length).toBeGreaterThan(0);
  });
  it("un taux hors grille est détecté", () => {
    const c = { ...calculFiscal(2600), taux: 33 };
    expect(verifierCoherence(c).length).toBeGreaterThan(0);
  });
});

describe("Cycle — bénéfice = flux net du coffre (des centaines de mouvements)", () => {
  it("agrège correctement entrées et sorties", () => {
    const mvts: MvtCoffre[] = [];
    for (let i = 0; i < 300; i++) mvts.push({ sens: "entree", montant: 10, createdAt: "2026-01-01T00:00:00Z" }); // +3000
    for (let i = 0; i < 50; i++) mvts.push({ sens: "sortie", montant: 8, createdAt: "2026-01-01T00:00:00Z" });   // -400
    const cy = snapshotCycle(mvts, []);
    expect(cy.ca).toBe(3000);
    expect(cy.depenses).toBe(400);
    expect(cy.benefice).toBe(2600);
    expect(cy.taux).toBe(35);
    expect(cy.impot).toBe(910);
  });
  it("un paiement d'impôt (sortie « Impôt … ») n'entre PAS dans le bénéfice", () => {
    const mvts: MvtCoffre[] = [
      { sens: "entree", montant: 2600, createdAt: "2026-02-01T00:00:00Z" },
      { sens: "sortie", montant: 910, motif: "Impôt cycle (35%)", createdAt: "2026-02-01T01:00:00Z" },
    ];
    const cy = snapshotCycle(mvts, []);
    expect(cy.depenses).toBe(0);       // le règlement d'impôt est exclu
    expect(cy.benefice).toBe(2600);
  });
  it("le cycle ne compte que les mouvements après la dernière clôture", () => {
    const mvts: MvtCoffre[] = [
      { sens: "entree", montant: 5000, createdAt: "2026-01-01T00:00:00Z" }, // AVANT clôture
      { sens: "entree", montant: 1800, createdAt: "2026-03-01T00:00:00Z" }, // APRÈS clôture
    ];
    const cy = snapshotCycle(mvts, [{ payeAt: "2026-02-01T00:00:00Z", fin: null }]);
    expect(cy.depuis).toBe("2026-02-01T00:00:00Z");
    expect(cy.benefice).toBe(1800);
    expect(cy.taux).toBe(25);
  });
});

describe("Helpers", () => {
  it("estMouvementImpot reconnaît les libellés d'impôt", () => {
    expect(estMouvementImpot("Impôt — cycle")).toBe(true);
    expect(estMouvementImpot("Impot cycle")).toBe(true);
    expect(estMouvementImpot("Achat de bois")).toBe(false);
  });
  it("debutCycle retient la clôture la plus récente", () => {
    expect(debutCycle([{ payeAt: "2026-01-01", fin: null }, { payeAt: "2026-05-01", fin: null }])).toBe("2026-05-01");
    expect(debutCycle([])).toBeNull();
  });
});
