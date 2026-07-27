import { describe, it, expect } from "vitest";
import { resumeDirection } from "./cockpit";

describe("resumeDirection", () => {
  it("calme quand rien d'urgent", () => {
    const r = resumeDirection({ attentionTotal: 0, tachesEnRetard: 0, coffreNegatif: false });
    expect(r.ton).toBe("calme");
    expect(r.texte).toMatch(/sous contrôle/i);
  });
  it("vigilance à partir de 3 points d'attention", () => {
    expect(resumeDirection({ attentionTotal: 3, tachesEnRetard: 0, coffreNegatif: false }).ton).toBe("vigilance");
    expect(resumeDirection({ attentionTotal: 2, tachesEnRetard: 0, coffreNegatif: false }).ton).toBe("calme");
  });
  it("tendu si tâches en retard, trésorerie négative, ou attention élevée", () => {
    expect(resumeDirection({ attentionTotal: 0, tachesEnRetard: 1, coffreNegatif: false }).ton).toBe("tendu");
    expect(resumeDirection({ attentionTotal: 0, tachesEnRetard: 0, coffreNegatif: true }).ton).toBe("tendu");
    expect(resumeDirection({ attentionTotal: 8, tachesEnRetard: 0, coffreNegatif: false }).ton).toBe("tendu");
  });
  it("le texte mentionne les causes en cas de tension", () => {
    const r = resumeDirection({ attentionTotal: 5, tachesEnRetard: 2, coffreNegatif: true });
    expect(r.ton).toBe("tendu");
    expect(r.texte).toMatch(/trésorerie négative/);
    expect(r.texte).toMatch(/2 tâche/);
    expect(r.texte).toMatch(/5 point/);
  });
});
