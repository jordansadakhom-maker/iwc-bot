import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.SIGN_TOKEN_SECRET = "secret-de-test-iwc"; });

// Import dynamique après avoir posé le secret (le module le lit à l'exécution).
async function lib() { return await import("./sign-token"); }

describe("sign-token — jeton de signature de contrat", () => {
  it("aller-retour : un jeton créé se vérifie et rend l'opId", async () => {
    const { creerTokenSignature, verifierTokenSignature } = await lib();
    const tok = creerTokenSignature("op-123")!;
    expect(tok).toBeTruthy();
    expect(verifierTokenSignature(tok)).toEqual({ opId: "op-123" });
  });

  it("jeton falsifié → rejeté", async () => {
    const { creerTokenSignature, verifierTokenSignature } = await lib();
    const tok = creerTokenSignature("op-123")!;
    const falsifie = tok.slice(0, -3) + (tok.slice(-3) === "aaa" ? "bbb" : "aaa");
    expect(verifierTokenSignature(falsifie)).toBeNull();
  });

  it("opId trafiqué (même signature) → rejeté", async () => {
    const { creerTokenSignature, verifierTokenSignature } = await lib();
    const tok = creerTokenSignature("op-123")!;
    const [, exp, s] = tok.split(".");
    const autreId = Buffer.from("op-999").toString("base64url");
    expect(verifierTokenSignature(`${autreId}.${exp}.${s}`)).toBeNull();
  });

  it("jeton expiré → rejeté", async () => {
    const { creerTokenSignature, verifierTokenSignature } = await lib();
    const tok = creerTokenSignature("op-123", -1000)!; // déjà expiré
    expect(verifierTokenSignature(tok)).toBeNull();
  });

  it("format invalide → null (pas d'exception)", async () => {
    const { verifierTokenSignature } = await lib();
    expect(verifierTokenSignature("")).toBeNull();
    expect(verifierTokenSignature("nimportequoi")).toBeNull();
    expect(verifierTokenSignature("a.b")).toBeNull();
  });
});
