import { describe, it, expect } from "vitest";
import {
  notifMeta, correspondFiltre, compteNonLus, versCentreNotif, NOTIF_FILTRES,
  type CentreNotif,
} from "./notifications-centre";

const n = (over: Partial<CentreNotif> = {}): CentreNotif => ({
  id: "1", type: "telegramme", titre: "T", corps: null, lien: null, clientNom: null,
  cibleId: null, lu: false, luAt: null, archive: false, supprime: false, createdAt: "2026-07-26T10:00:00Z", ...over,
});

describe("notifMeta — métadonnées par type", () => {
  it("connaît les types métier", () => {
    expect(notifMeta("telegramme").icon).toBe("✉️");
    expect(notifMeta("telegramme-clos").tone).toBe("muted");
    expect(notifMeta("message").label).toBe("Nouvelle réponse");
    expect(notifMeta("rdv").icon).toBe("📅");
    expect(notifMeta("rdv-statut").tone).toBe("good");
    expect(notifMeta("contrat").icon).toBe("📜");
    expect(notifMeta("operation").icon).toBe("🎯");
    expect(notifMeta("operation-statut").tone).toBe("good");
    expect(notifMeta("candidature").icon).toBe("🐺");
    expect(notifMeta("candidature-statut").label).toBe("Décision de candidature");
  });
  it("retombe sur un défaut sûr pour un type inconnu", () => {
    expect(notifMeta("_bidon_")).toEqual({ icon: "🔔", label: "Notification", tone: "muted" });
  });
});

describe("correspondFiltre — filtres du centre", () => {
  it("« tous » exclut les archivées", () => {
    expect(correspondFiltre(n({ archive: false }), "tous")).toBe(true);
    expect(correspondFiltre(n({ archive: true }), "tous")).toBe(false);
  });
  it("« non_lus » = non lu ET non archivé", () => {
    expect(correspondFiltre(n({ lu: false }), "non_lus")).toBe(true);
    expect(correspondFiltre(n({ lu: true }), "non_lus")).toBe(false);
    expect(correspondFiltre(n({ lu: false, archive: true }), "non_lus")).toBe(false);
  });
  it("« telegrammes » couvre télégramme + clôture (les messages ont leur filtre)", () => {
    expect(correspondFiltre(n({ type: "telegramme" }), "telegrammes")).toBe(true);
    expect(correspondFiltre(n({ type: "telegramme-clos" }), "telegrammes")).toBe(true);
    expect(correspondFiltre(n({ type: "message" }), "telegrammes")).toBe(false);
    expect(correspondFiltre(n({ type: "message" }), "messages")).toBe(true);
    expect(correspondFiltre(n({ type: "rdv" }), "telegrammes")).toBe(false);
  });
  it("« rdv » couvre rdv + rdv-statut", () => {
    expect(correspondFiltre(n({ type: "rdv" }), "rdv")).toBe(true);
    expect(correspondFiltre(n({ type: "rdv-statut" }), "rdv")).toBe(true);
    expect(correspondFiltre(n({ type: "telegramme" }), "rdv")).toBe(false);
  });
  it("« operations » et « contrats » sont des filtres distincts, hors archive", () => {
    expect(correspondFiltre(n({ type: "operation" }), "operations")).toBe(true);
    expect(correspondFiltre(n({ type: "operation-statut" }), "operations")).toBe(true);
    expect(correspondFiltre(n({ type: "contrat" }), "operations")).toBe(false);
    expect(correspondFiltre(n({ type: "contrat" }), "contrats")).toBe(true);
    expect(correspondFiltre(n({ type: "contrat-statut" }), "contrats")).toBe(true);
    expect(correspondFiltre(n({ type: "operation", archive: true }), "operations")).toBe(false);
    expect(correspondFiltre(n({ type: "rdv" }), "operations")).toBe(false);
  });
  it("« recrutement » couvre les candidatures", () => {
    expect(correspondFiltre(n({ type: "candidature" }), "recrutement")).toBe(true);
    expect(correspondFiltre(n({ type: "candidature-statut" }), "recrutement")).toBe(true);
    expect(correspondFiltre(n({ type: "contrat" }), "recrutement")).toBe(false);
  });
  it("« archive » ne montre QUE les archivées", () => {
    expect(correspondFiltre(n({ archive: true }), "archive")).toBe(true);
    expect(correspondFiltre(n({ archive: false }), "archive")).toBe(false);
  });
  it("chaque filtre déclaré a une clé exploitable", () => {
    for (const f of NOTIF_FILTRES) expect(typeof correspondFiltre(n(), f.key)).toBe("boolean");
  });
});

describe("compteNonLus — pastille rouge", () => {
  it("ne compte que les non-lues actives (hors archive)", () => {
    const list = [n({ lu: false }), n({ id: "2", lu: true }), n({ id: "3", lu: false, archive: true }), n({ id: "4", lu: false })];
    expect(compteNonLus(list)).toBe(2);
  });
});

describe("versCentreNotif — normalisation d'une ligne brute", () => {
  it("mappe les colonnes et force les booléens/chaines", () => {
    const row = { id: 7, type: "rdv", titre: "RDV", corps: null, lien: "/x", clientNom: "F. Williamson", cibleId: "abc", lu: 1, luAt: null, archive: 0, createdAt: "2026-07-26T09:00:00Z" };
    const out = versCentreNotif(row);
    expect(out.id).toBe("7");
    expect(out.lu).toBe(true);
    expect(out.archive).toBe(false);
    expect(out.clientNom).toBe("F. Williamson");
    expect(out.corps).toBeNull();
  });
});
