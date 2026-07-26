import { describe, it, expect } from "vitest";
import { activiteMeta, modulesDe, filtrerActivite, versActiviteItem, type ActiviteItem } from "./activite";

const a = (over: Partial<ActiviteItem> = {}): ActiviteItem => ({
  id: "1", module: "coffre", action: "coffre.ajuste", cible: "Coffre commun", cibleId: null, par: "John", at: "2026-07-26T10:00:00Z", ...over,
});

describe("activiteMeta", () => {
  it("connaît les modules métier", () => {
    expect(activiteMeta("coffre").icon).toBe("💰");
    expect(activiteMeta("Contrat").label).toBe("Contrats"); // insensible à la casse
  });
  it("retombe sur un défaut pour un module inconnu", () => {
    expect(activiteMeta("_bidon_").label).toBe("_bidon_");
    expect(activiteMeta("").label).toBe("Activité");
  });
});

describe("modulesDe", () => {
  it("liste unique et triée", () => {
    const list = [a(), a({ id: "2", module: "wallet" }), a({ id: "3", module: "coffre" })];
    expect(modulesDe(list)).toEqual(["coffre", "wallet"]);
  });
});

describe("filtrerActivite", () => {
  const list = [
    a({ id: "1", module: "coffre", action: "coffre.ajuste", par: "John" }),
    a({ id: "2", module: "wallet", action: "wallet.ajuste", par: "Jane", cible: "Portefeuille" }),
    a({ id: "3", module: "operation", action: "suppression", cible: "Braquage" }),
  ];
  it("« tous » ne filtre pas par module", () => {
    expect(filtrerActivite(list, "tous", "").length).toBe(3);
  });
  it("filtre par module", () => {
    expect(filtrerActivite(list, "wallet", "").map((x) => x.id)).toEqual(["2"]);
  });
  it("recherche texte sur action/cible/par", () => {
    expect(filtrerActivite(list, "tous", "jane").map((x) => x.id)).toEqual(["2"]);
    expect(filtrerActivite(list, "tous", "braquage").map((x) => x.id)).toEqual(["3"]);
    expect(filtrerActivite(list, "tous", "ajuste").length).toBe(2);
  });
  it("combine module + recherche", () => {
    expect(filtrerActivite(list, "coffre", "john").map((x) => x.id)).toEqual(["1"]);
    expect(filtrerActivite(list, "coffre", "jane").length).toBe(0);
  });
});

describe("versActiviteItem", () => {
  it("normalise une ligne brute", () => {
    const r = { id: 7, module: "Facture", action: "suppression", cible: "Facture", cibleId: "f-1", par: "Kane", at: "2026-07-26T09:00:00Z" };
    expect(versActiviteItem(r)).toEqual({ id: "7", module: "Facture", action: "suppression", cible: "Facture", cibleId: "f-1", par: "Kane", at: "2026-07-26T09:00:00Z" });
  });
});
