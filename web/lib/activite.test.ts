import { describe, it, expect } from "vitest";
import { activiteMeta, modulesDe, filtrerActivite, versActiviteItem, motifDe, diffAvantApres, activiteCSV, type ActiviteItem } from "./activite";

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
  it("normalise une ligne brute (sans champs enrichis → objet minimal)", () => {
    const r = { id: 7, module: "Facture", action: "suppression", cible: "Facture", cibleId: "f-1", par: "Kane", at: "2026-07-26T09:00:00Z" };
    expect(versActiviteItem(r)).toEqual({ id: "7", module: "Facture", action: "suppression", cible: "Facture", cibleId: "f-1", par: "Kane", at: "2026-07-26T09:00:00Z" });
  });
  it("ajoute avant/apres/payload/parId quand ils existent", () => {
    const r = { id: 8, module: "membre", action: "membre.fiche", cible: "John", cibleId: "1", par: "Chef", at: "2026-07-26T09:00:00Z", parId: "42", avant: { salaire: 100 }, apres: { salaire: 200 }, payload: { motif: "promotion" } };
    const out = versActiviteItem(r);
    expect(out.parId).toBe("42");
    expect(out.avant).toEqual({ salaire: 100 });
    expect(out.payload).toEqual({ motif: "promotion" });
  });
});

describe("filtrerActivite — plage de dates", () => {
  const list = [
    a({ id: "1", at: "2026-07-20T10:00:00Z" }),
    a({ id: "2", at: "2026-07-25T10:00:00Z" }),
    a({ id: "3", at: "2026-07-30T10:00:00Z" }),
  ];
  it("borne inférieure incluse", () => {
    expect(filtrerActivite(list, "tous", "", "2026-07-25").map((x) => x.id)).toEqual(["2", "3"]);
  });
  it("plage fermée", () => {
    expect(filtrerActivite(list, "tous", "", "2026-07-22", "2026-07-27").map((x) => x.id)).toEqual(["2"]);
  });
});

describe("motifDe & diffAvantApres", () => {
  it("extrait le motif du payload (motif ou raison)", () => {
    expect(motifDe(a({ payload: { motif: "erreur de saisie" } }))).toBe("erreur de saisie");
    expect(motifDe(a({ payload: { raison: "ajustement" } }))).toBe("ajustement");
    expect(motifDe(a())).toBeNull();
  });
  it("liste les champs modifiés uniquement", () => {
    const d = diffAvantApres(a({ avant: { salaire: 100, statut: "actif" }, apres: { salaire: 200, statut: "actif" } }));
    expect(d).toEqual([{ champ: "salaire", de: "100", vers: "200" }]);
  });
  it("renvoie [] si avant/apres non comparables", () => {
    expect(diffAvantApres(a())).toEqual([]);
  });
});

describe("activiteCSV", () => {
  it("produit un en-tête + une ligne par entrée, motif inclus", () => {
    const csv = activiteCSV([a({ action: "coffre.ajuste", payload: { motif: "vente" } })]);
    const lignes = csv.split("\n");
    expect(lignes[0]).toBe("Date;Module;Action;Cible;Auteur;Motif");
    expect(lignes[1]).toContain("coffre.ajuste");
    expect(lignes[1]).toContain("vente");
  });
});
