import { describe, it, expect } from "vitest";
import { constatsSocle } from "./erp-assistant-const";

const NOW = 2_000_000_000_000;
const iso = (dMs: number) => new Date(NOW + dMs).toISOString();

describe("constatsSocle", () => {
  it("aucune donnée → aucun constat", () => {
    expect(constatsSocle({}, NOW)).toEqual([]);
  });

  it("détecte les tâches en retard (non faites, échéance passée)", () => {
    const c = constatsSocle({ taches: [
      { statut: "a_faire", echeance: iso(-1000), assigneId: "m1" },
      { statut: "faite", echeance: iso(-1000), assigneId: "m1" },   // faite → ignorée
      { statut: "a_faire", echeance: iso(+1000), assigneId: "m1" },  // future → ignorée
    ] }, NOW);
    const r = c.find((x) => x.id === "taches-retard");
    expect(r).toBeTruthy();
    expect(r!.titre).toMatch(/1 tâche/);
    expect(r!.priorite).toBe("importante");
  });

  it("détecte les tâches non assignées non faites", () => {
    const c = constatsSocle({ taches: [
      { statut: "a_faire", echeance: null, assigneId: null },
      { statut: "en_cours", echeance: null, assigneId: null },
      { statut: "faite", echeance: null, assigneId: null },          // faite → ignorée
      { statut: "a_faire", echeance: null, assigneId: "m1" },        // assignée → ignorée
    ] }, NOW);
    const r = c.find((x) => x.id === "taches-non-assignees");
    expect(r?.titre).toMatch(/2 tâche/);
  });

  it("détecte les conversations inactives > 7 j (hors archivées)", () => {
    const c = constatsSocle({ conversations: [
      { statut: "ouverte", lastMessageAt: iso(-8 * 86400000) },
      { statut: "ouverte", lastMessageAt: iso(-1 * 86400000) },      // récente → ignorée
      { statut: "archivee", lastMessageAt: iso(-30 * 86400000) },    // archivée → ignorée
    ] }, NOW);
    const r = c.find((x) => x.id === "conv-inactives");
    expect(r?.titre).toMatch(/1 conversation/);
    expect(r?.priorite).toBe("information");
  });
});
