import { describe, it, expect } from "vitest";
import { apercu, estNonLu, estArchivee, comparerConversations, trierConversations, versConversation, versMessage, type Conversation } from "./conversations";

const c = (over: Partial<Conversation> = {}): Conversation => ({
  id: "1", sujet: "S", pole: null, statut: "ouverte", creePar: null, creeParId: null,
  lastMessageAt: "2025-01-02T00:00:00.000Z", lastApercu: null, lastAuteur: null,
  createdAt: "2025-01-01T00:00:00.000Z", ...over,
});

describe("apercu", () => {
  it("compacte les espaces et tronque avec une ellipse", () => {
    expect(apercu("  bonjour   à   tous ")).toBe("bonjour à tous");
    expect(apercu("abcdef", 4)).toBe("abc…");
    expect(apercu("abc", 4)).toBe("abc");
  });
});

describe("estNonLu", () => {
  it("jamais vu = non lu", () => { expect(estNonLu(c(), null)).toBe(true); });
  it("dernier message après la vue = non lu", () => {
    expect(estNonLu(c({ lastMessageAt: "2025-01-03T00:00:00.000Z" }), "2025-01-02T00:00:00.000Z")).toBe(true);
  });
  it("vue postérieure ou égale = lu", () => {
    expect(estNonLu(c({ lastMessageAt: "2025-01-02T00:00:00.000Z" }), "2025-01-02T00:00:00.000Z")).toBe(false);
    expect(estNonLu(c({ lastMessageAt: "2025-01-01T00:00:00.000Z" }), "2025-01-02T00:00:00.000Z")).toBe(false);
  });
});

describe("tri des conversations", () => {
  it("les archivées passent en bas", () => {
    const arch = c({ id: "a", statut: "archivee", lastMessageAt: "2025-06-01T00:00:00.000Z" });
    const ouv = c({ id: "o", lastMessageAt: "2025-01-01T00:00:00.000Z" });
    expect(trierConversations([arch, ouv]).map((x) => x.id)).toEqual(["o", "a"]);
  });
  it("à statut égal, le plus récemment animé en tête", () => {
    const vieux = c({ id: "v", lastMessageAt: "2025-01-01T00:00:00.000Z" });
    const neuf = c({ id: "n", lastMessageAt: "2025-05-01T00:00:00.000Z" });
    expect(trierConversations([vieux, neuf]).map((x) => x.id)).toEqual(["n", "v"]);
  });
  it("estArchivee / comparerConversations", () => {
    expect(estArchivee(c({ statut: "archivee" }))).toBe(true);
    expect(comparerConversations(c({ statut: "archivee" }), c())).toBe(1);
  });
});

describe("normalisation", () => {
  it("versConversation applique les valeurs par défaut", () => {
    const out = versConversation({ id: 7, sujet: "Plan", statut: null });
    expect(out.id).toBe("7");
    expect(out.statut).toBe("ouverte");
    expect(out.pole).toBeNull();
  });
  it("versMessage normalise", () => {
    const out = versMessage({ id: 3, conversationId: 7, corps: "Salut" });
    expect(out.id).toBe("3");
    expect(out.conversationId).toBe("7");
    expect(out.corps).toBe("Salut");
    expect(out.auteurNom).toBeNull();
  });
});
