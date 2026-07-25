import { describe, it, expect } from "vitest";
import {
  factureOuverte, echeanceEtat, factureStatut, estBandage, norm,
  FACTURE_DELAI_H, FACTURE_STATUTS,
} from "./dispensaire-facturation-const";

describe("factureOuverte — une facture encore due", () => {
  it("payée / clôturée = fermée", () => {
    expect(factureOuverte("payee")).toBe(false);
    expect(factureOuverte("cloture")).toBe(false);
  });
  it("tous les autres statuts = ouverte (encore due)", () => {
    for (const st of ["non_payee", "relancee", "en_attente", "transmise", "dossier_police"]) {
      expect(factureOuverte(st)).toBe(true);
    }
  });
});

describe("echeanceEtat — état d'échéance d'une facture ouverte", () => {
  const now = 2_000_000_000_000;
  const iso = (deltaMs: number) => new Date(now + deltaMs).toISOString();
  it("échéance passée → dépassée", () => {
    expect(echeanceEtat({ statut: "non_payee", dateEcheance: iso(-3_600_000) }, now)).toBe("depasse");
  });
  it("échéance dans < 24 h → bientôt", () => {
    expect(echeanceEtat({ statut: "non_payee", dateEcheance: iso(3_600_000) }, now)).toBe("bientot");
  });
  it("échéance dans > 24 h → ok", () => {
    expect(echeanceEtat({ statut: "non_payee", dateEcheance: iso(48 * 3_600_000) }, now)).toBe("ok");
  });
  it("facture réglée / sans date → aucun état", () => {
    expect(echeanceEtat({ statut: "payee", dateEcheance: iso(-3_600_000) }, now)).toBeNull();
    expect(echeanceEtat({ statut: "non_payee", dateEcheance: null }, now)).toBeNull();
  });
});

describe("Constantes & helpers de facturation", () => {
  it("délai de paiement automatique = 72 h", () => {
    expect(FACTURE_DELAI_H).toBe(72);
  });
  it("factureStatut retombe sur le 1er statut si inconnu", () => {
    expect(factureStatut("relancee").label).toBe("Relancée");
    expect(factureStatut("_inconnu_")).toBe(FACTURE_STATUTS[0]);
  });
  it("estBandage reconnaît un bandage quelle que soit la casse/accent", () => {
    expect(estBandage("Bandage")).toBe(true);
    expect(estBandage("BANDAGE x3")).toBe(true);
    expect(estBandage("Morphine")).toBe(false);
  });
  it("norm déburre et met en minuscules (en gardant les mots)", () => {
    expect(norm("  Médicament ")).toBe("medicament");
  });
});
