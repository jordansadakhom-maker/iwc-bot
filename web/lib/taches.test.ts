import { describe, it, expect } from "vitest";
import { prioriteMeta, estFaite, estEnRetard, comparerTaches, trierTaches, versTache, type Tache } from "./taches";

const NOW = 2_000_000_000_000;
const iso = (dMs: number) => new Date(NOW + dMs).toISOString();
const t = (over: Partial<Tache> = {}): Tache => ({
  id: "1", titre: "T", detail: null, assigneId: null, assigneNom: null, pole: null,
  priorite: "normale", echeance: null, statut: "a_faire", source: "manuel", creePar: null,
  createdAt: iso(-86400000), ...over,
});

describe("prioriteMeta", () => {
  it("connaît les priorités et retombe sur normale", () => {
    expect(prioriteMeta("urgente").rang).toBe(0);
    expect(prioriteMeta("_x_").key).toBe("normale");
  });
});

describe("estEnRetard", () => {
  it("non faite + échéance passée = en retard", () => {
    expect(estEnRetard(t({ echeance: iso(-1000) }), NOW)).toBe(true);
  });
  it("faite ou sans échéance ou future = pas en retard", () => {
    expect(estEnRetard(t({ echeance: iso(-1000), statut: "faite" }), NOW)).toBe(false);
    expect(estEnRetard(t({ echeance: null }), NOW)).toBe(false);
    expect(estEnRetard(t({ echeance: iso(1000) }), NOW)).toBe(false);
  });
});

describe("comparerTaches / trierTaches", () => {
  it("les faites passent en bas", () => {
    const faite = t({ id: "f", statut: "faite", priorite: "urgente" });
    const aFaire = t({ id: "a", priorite: "basse" });
    expect(trierTaches([faite, aFaire], NOW).map((x) => x.id)).toEqual(["a", "f"]);
  });
  it("en retard avant à venir", () => {
    const retard = t({ id: "r", echeance: iso(-1000), priorite: "basse" });
    const avenir = t({ id: "v", echeance: iso(100000), priorite: "urgente" });
    expect(trierTaches([avenir, retard], NOW).map((x) => x.id)).toEqual(["r", "v"]);
  });
  it("à priorité/retard égaux, la plus urgente puis l'échéance la plus proche", () => {
    const urg = t({ id: "u", priorite: "urgente" });
    const norm = t({ id: "n", priorite: "normale" });
    expect(trierTaches([norm, urg], NOW).map((x) => x.id)).toEqual(["u", "n"]);
  });
  it("estFaite", () => {
    expect(estFaite(t({ statut: "faite" }))).toBe(true);
    expect(estFaite(t())).toBe(false);
  });
});

describe("versTache", () => {
  it("normalise + valeurs par défaut", () => {
    const out = versTache({ id: 5, titre: "Ranger", statut: null, priorite: null });
    expect(out.id).toBe("5");
    expect(out.statut).toBe("a_faire");
    expect(out.priorite).toBe("normale");
    expect(out.detail).toBeNull();
  });
});
