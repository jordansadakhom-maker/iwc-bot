import { describe, it, expect } from "vitest";
import { construireCanon, normChasse } from "./chasse-canon";

// Regroupement des noms de ressources TRONQUÉS par l'OCR. Doit fusionner une
// troncature avec sa forme complète, MAIS jamais deux ressources distinctes.
describe("construireCanon — regroupement des troncatures", () => {
  it("une troncature tombe sur sa forme complète", () => {
    const c = construireCanon(["Viande de petit g", "Viande de petit gibier"]);
    expect(c.cle("Viande de petit g")).toBe(c.cle("Viande de petit gibier"));
    expect(c.label(c.cle("Viande de petit g"))).toBe("Viande de petit gibier");
  });
  it("choisit toujours la forme la plus complète comme libellé", () => {
    const c = construireCanon(["Peau", "Peaux"]);
    expect(c.label(c.cle("Peau"))).toBe("Peaux");
  });
  it("NE fusionne PAS deux ressources réellement distinctes", () => {
    const c = construireCanon(["Viande de petit gibier", "Viande de gros gibier"]);
    expect(c.cle("Viande de petit gibier")).not.toBe(c.cle("Viande de gros gibier"));
  });
  it("« Viande de gibier » reste distincte de « …gros gibier »", () => {
    const c = construireCanon(["Viande de gibier", "Viande de gros gibier"]);
    expect(c.cle("Viande de gibier")).not.toBe(c.cle("Viande de gros gibier"));
  });
  it("gère un lot mixte (chaîne de troncatures + branches distinctes)", () => {
    const c = construireCanon(["Viande de petit g", "Viande de petit gibier", "Viande de gros gi", "Viande de gros gibier"]);
    expect(c.label(c.cle("Viande de petit g"))).toBe("Viande de petit gibier");
    expect(c.label(c.cle("Viande de gros gi"))).toBe("Viande de gros gibier");
    expect(c.cle("Viande de petit g")).not.toBe(c.cle("Viande de gros gi"));
  });
});

describe("normChasse (= cleNom partagé)", () => {
  it("normalise casse, accents et espaces", () => {
    expect(normChasse("Viande de Cerf")).toBe("viandedecerf");
    expect(normChasse("Peaux d'ours")).toBe("peauxdours");
  });
});
