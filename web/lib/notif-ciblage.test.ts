import { describe, it, expect } from "vitest";
import { rolesDeActeur, notifVisiblePour, orCibleNotif } from "./notif-ciblage";

describe("rolesDeActeur", () => {
  it("dérive les rôles des drapeaux d'accès", () => {
    expect(rolesDeActeur({ direction: true, officier: true })).toEqual(["direction", "officier"]);
    expect(rolesDeActeur({ medecin: true, armurier: true })).toEqual(["medecin", "armurier"]);
    expect(rolesDeActeur({})).toEqual([]);
  });
});

describe("notifVisiblePour", () => {
  const moi = { did: "123456", roles: ["officier"] };
  it("équipe (membreId & roleCible null) → visible de tous", () => {
    expect(notifVisiblePour({ membreId: null, roleCible: null }, moi)).toBe(true);
    expect(notifVisiblePour({}, { did: null, roles: [] })).toBe(true);
  });
  it("ciblée membre → seulement le destinataire", () => {
    expect(notifVisiblePour({ membreId: "123456" }, moi)).toBe(true);
    expect(notifVisiblePour({ membreId: "999" }, moi)).toBe(false);
  });
  it("ciblée rôle → seulement les porteurs du rôle", () => {
    expect(notifVisiblePour({ roleCible: "officier" }, moi)).toBe(true);
    expect(notifVisiblePour({ roleCible: "Direction" }, moi)).toBe(false);
    expect(notifVisiblePour({ roleCible: "direction" }, { did: "1", roles: ["direction"] })).toBe(true);
  });
});

describe("orCibleNotif", () => {
  it("toujours la branche équipe ; ajoute membre (id valide) et rôles (alpha)", () => {
    expect(orCibleNotif({ did: "123456", roles: ["direction", "officier"] }))
      .toBe("and(membreId.is.null,roleCible.is.null),membreId.eq.123456,roleCible.in.(direction,officier)");
  });
  it("ignore un id non numérique et des rôles non alphabétiques (anti-injection)", () => {
    expect(orCibleNotif({ did: "abc", roles: ["dir;ection", "officier"] }))
      .toBe("and(membreId.is.null,roleCible.is.null),roleCible.in.(officier)");
  });
  it("sans membre ni rôle → branche équipe seule", () => {
    expect(orCibleNotif({ did: null, roles: [] })).toBe("and(membreId.is.null,roleCible.is.null)");
  });
});
