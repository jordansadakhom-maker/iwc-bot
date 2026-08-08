import { describe, it, expect } from "vitest";
import {
  factureOuverte, echeanceEtat, factureStatut, estBandage, norm,
  FACTURE_DELAI_H, FACTURE_STATUTS,
  statutsDe, serialiserStatuts, statutRepresentatif, incoherencesStatuts,
  estOuverte, estClose,
  ageFactureJours, joursDeRetard, estDeclarableFDO, RETARD_DEFAUT_JOURS,
  parseMontant, money,
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

describe("statutsDe — lecture des statuts multiples (avec repli)", () => {
  it("parse une chaîne CSV `statuts`", () => {
    expect(statutsDe({ statuts: "non_payee,relancee,transmise" })).toEqual(["non_payee", "relancee", "transmise"]);
  });
  it("parse un tableau `statuts`", () => {
    expect(statutsDe({ statuts: ["payee", "cloture"] })).toEqual(["payee", "cloture"]);
  });
  it("repli sur `statut` unique quand `statuts` est absent (compat)", () => {
    expect(statutsDe({ statut: "relancee" })).toEqual(["relancee"]);
  });
  it("nettoie : espaces, doublons et clés inconnues écartés", () => {
    expect(statutsDe({ statuts: " non_payee , non_payee , _bidon_ ,relancee" })).toEqual(["non_payee", "relancee"]);
  });
  it("jamais vide : retombe sur `non_payee`", () => {
    expect(statutsDe({})).toEqual(["non_payee"]);
    expect(statutsDe({ statuts: "_bidon_" })).toEqual(["non_payee"]);
  });
});

describe("serialiserStatuts — écriture CSV robuste", () => {
  it("sérialise en CSV en filtrant/dédupliquant", () => {
    expect(serialiserStatuts(["non_payee", "non_payee", "relancee", "_x_"])).toBe("non_payee,relancee");
  });
  it("jamais vide : retombe sur `non_payee`", () => {
    expect(serialiserStatuts([])).toBe("non_payee");
  });
  it("aller-retour statutsDe(serialiser(x)) est stable", () => {
    const x = ["non_payee", "relancee", "dossier_police"];
    expect(statutsDe({ statuts: serialiserStatuts(x) })).toEqual(x);
  });
});

describe("estOuverte / estClose — sortie des impayés", () => {
  it("Payée OU Clôturée ferme la facture", () => {
    expect(estClose(["non_payee", "payee"])).toBe(true);
    expect(estClose(["relancee", "cloture"])).toBe(true);
    expect(estOuverte(["non_payee", "relancee", "transmise", "dossier_police"])).toBe(true);
  });
  it("une facture non payée mais transmise reste ouverte (encore due)", () => {
    expect(estOuverte(["non_payee", "transmise", "dossier_police"])).toBe(true);
  });
});

describe("statutRepresentatif — statut principal (compat colonne `statut`)", () => {
  it("priorise payée > clôturé > dossier police > transmis > relancé > en attente > non payé", () => {
    expect(statutRepresentatif(["non_payee", "relancee", "payee"])).toBe("payee");
    expect(statutRepresentatif(["non_payee", "dossier_police", "transmise"])).toBe("dossier_police");
    expect(statutRepresentatif(["non_payee", "relancee"])).toBe("relancee");
    expect(statutRepresentatif(["non_payee"])).toBe("non_payee");
  });
});

describe("incoherencesStatuts — avertissements NON bloquants", () => {
  it("Payé + Non payé = contradictoire", () => {
    expect(incoherencesStatuts(["payee", "non_payee"]).length).toBe(1);
  });
  it("Payé + Dossier police = inhabituel", () => {
    expect(incoherencesStatuts(["payee", "dossier_police"]).length).toBe(1);
  });
  it("Clôturé sans Payé = créance abandonnée ?", () => {
    expect(incoherencesStatuts(["cloture", "non_payee"]).length).toBe(1);
    // mais Clôturé + Payé est parfaitement cohérent
    expect(incoherencesStatuts(["cloture", "payee"]).length).toBe(0);
  });
  it("combinaisons courantes = aucun avertissement", () => {
    expect(incoherencesStatuts(["non_payee", "relancee", "transmise", "dossier_police"])).toEqual([]);
    expect(incoherencesStatuts(["payee", "cloture"])).toEqual([]);
  });
});

describe("echeanceEtat — prise en compte des statuts multiples", () => {
  const now = 2_000_000_000_000;
  const iso = (deltaMs: number) => new Date(now + deltaMs).toISOString();
  it("ouverte via `statuts` en retard → dépassée", () => {
    expect(echeanceEtat({ statuts: ["non_payee", "relancee"], dateEcheance: iso(-3_600_000) }, now)).toBe("depasse");
  });
  it("fermée via `statuts` (payée) → aucun état, même en retard", () => {
    expect(echeanceEtat({ statuts: ["non_payee", "payee"], dateEcheance: iso(-3_600_000) }, now)).toBeNull();
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

describe("parseMontant — saisie de montants décimaux (virgule ou point)", () => {
  it("accepte la virgule comme séparateur décimal", () => {
    expect(parseMontant("10,50")).toBe(10.5);
    expect(parseMontant("25,75")).toBe(25.75);
    expect(parseMontant("99,99")).toBe(99.99);
  });
  it("accepte aussi le point", () => {
    expect(parseMontant("10.50")).toBe(10.5);
    expect(parseMontant("0.99")).toBe(0.99);
  });
  it("gère les entiers et ignore espaces / symbole $", () => {
    expect(parseMontant("100")).toBe(100);
    expect(parseMontant(" 1 234,5 $")).toBe(1234.5);
  });
  it("arrondit au centime et n'accepte jamais de négatif", () => {
    expect(parseMontant("10,999")).toBe(11);      // arrondi au centime
    expect(parseMontant("-5")).toBe(0);           // pas de négatif
    expect(parseMontant("abc")).toBe(0);          // invalide → 0
    expect(parseMontant("")).toBe(0);
  });
  it("conserve les centimes (pas d'arrondi entier)", () => {
    expect(parseMontant(10.5)).toBe(10.5);
    expect(parseMontant("99,99")).not.toBe(100);
  });
});

describe("money — affichage avec centimes (fr-FR)", () => {
  it("affiche toujours deux décimales, virgule française", () => {
    expect(money(10.5)).toBe("$10,50");
    expect(money(99.99)).toBe("$99,99");
    expect(money(100)).toBe("$100,00");
  });
});

describe("Retard des factures (déclarations FDO)", () => {
  const NOW = Date.parse("2026-07-30T12:00:00Z");
  const DAY = 86400000;
  const facture = (jours: number, statuts: string[] = ["non_payee"]) => ({
    dateEmission: new Date(NOW - jours * DAY).toISOString(), createdAt: new Date(NOW - jours * DAY).toISOString(),
    statut: statuts[0], statuts,
  });

  it("ageFactureJours compte les jours pleins depuis l'émission", () => {
    expect(ageFactureJours(facture(0), NOW)).toBe(0);
    expect(ageFactureJours(facture(5), NOW)).toBe(5);
  });
  it("joursDeRetard = âge − délai autorisé, jamais négatif", () => {
    expect(joursDeRetard(facture(2), 3, NOW)).toBe(0);   // encore dans les délais
    expect(joursDeRetard(facture(3), 3, NOW)).toBe(0);   // pile à échéance
    expect(joursDeRetard(facture(7), 3, NOW)).toBe(4);   // 4 jours de retard
  });
  it("estDeclarableFDO : non payée ET délai atteint", () => {
    expect(estDeclarableFDO(facture(1), 3, NOW)).toBe(false);              // trop récente
    expect(estDeclarableFDO(facture(5), 3, NOW)).toBe(true);               // en retard
    expect(estDeclarableFDO(facture(10, ["payee"]), 3, NOW)).toBe(false);  // payée → jamais déclarée
    expect(estDeclarableFDO(facture(10, ["cloture"]), 3, NOW)).toBe(false);
  });
  it("le délai par défaut est de 3 jours", () => {
    expect(RETARD_DEFAUT_JOURS).toBe(3);
  });
});
