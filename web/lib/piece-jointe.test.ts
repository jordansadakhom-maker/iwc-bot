import { describe, it, expect } from "vitest";
import { validerPieceJointe, estUrlImage, PIECE_JOINTE_MAX } from "./piece-jointe";

describe("validerPieceJointe — sécurité (https + image uniquement)", () => {
  it("accepte les extensions image en https", () => {
    for (const u of [
      "https://exemple.com/blessure.png",
      "https://exemple.com/radio.JPG",
      "https://exemple.com/x.jpeg",
      "https://exemple.com/doc.webp",
      "https://exemple.com/anim.gif",
      "https://exemple.com/img.png?token=abc#x",
    ]) {
      expect(validerPieceJointe(u).ok, u).toBe(true);
    }
  });

  it("accepte les liens Discord CDN", () => {
    expect(validerPieceJointe("https://cdn.discordapp.com/attachments/1/2/photo.png?ex=1&is=2").ok).toBe(true);
    expect(validerPieceJointe("https://media.discordapp.net/attachments/1/2/x.jpg").ok).toBe(true);
  });

  it("vide = accepté (pas de pièce jointe)", () => {
    const r = validerPieceJointe("   ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe("");
  });

  it("refuse tout ce qui n'est pas https", () => {
    for (const u of [
      "http://exemple.com/x.png",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "blob:https://exemple.com/abc",
      "file:///etc/passwd",
      "ftp://exemple.com/x.png",
    ]) {
      expect(validerPieceJointe(u).ok, u).toBe(false);
    }
  });

  it("refuse un https qui n'est pas une image", () => {
    expect(validerPieceJointe("https://exemple.com/page.html").ok).toBe(false);
    expect(validerPieceJointe("https://exemple.com/").ok).toBe(false);
  });

  it("refuse un lien trop long", () => {
    expect(validerPieceJointe("https://exemple.com/" + "a".repeat(PIECE_JOINTE_MAX) + ".png").ok).toBe(false);
  });

  it("normalise l'URL renvoyée", () => {
    const r = validerPieceJointe("https://exemple.com/a.png");
    expect(r.ok && r.url).toBe("https://exemple.com/a.png");
  });
});

describe("estUrlImage", () => {
  it("vrai pour une image https, faux sinon", () => {
    expect(estUrlImage("https://x.com/a.png")).toBe(true);
    expect(estUrlImage("http://x.com/a.png")).toBe(false);
    expect(estUrlImage("https://x.com/a.pdf")).toBe(false);
    expect(estUrlImage("")).toBe(false);
  });
});
