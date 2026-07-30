import { test, expect } from "@playwright/test";
import { DISPENSAIRE_ROUTES, ERROR_BOUNDARY_TEXT, collecteurErreurs, joindreJournal, nonConnecte } from "./_helpers";

// ── Smoke Dispensaire de Saint-Denis ─────────────────────────────────────────
// Ouvre CHAQUE page du dispensaire et vérifie qu'elle se charge sans planter :
//   1. pas de 5xx serveur,
//   2. pas d'exception JS non capturée (pageerror),
//   3. jamais l'écran de crash « Cette page n'a pas pu se charger »,
//   4. la page a rendu quelque chose (body non vide).
// Le dispensaire a son propre contrôle d'accès : une session non habilitée voit
// un écran « Accès réservé » — ce n'est pas un crash, le test passe. Nécessite
// auth.json (voir README). Sans session → skip explicite.

test.describe("Dispensaire — smoke de navigation", () => {
  for (const route of DISPENSAIRE_ROUTES) {
    test(`${route} charge sans planter`, async ({ page }, testInfo) => {
      const j = collecteurErreurs(page);

      const reponse = await page.goto(route, { waitUntil: "domcontentloaded" });

      if (await nonConnecte(page)) {
        test.skip(true, "Pas de session (auth.json manquant ou expiré) — voir README.");
      }

      if (reponse) expect(reponse.status(), `HTTP ${reponse.status()} sur ${route}`).toBeLessThan(500);

      await expect(page.getByText(ERROR_BOUNDARY_TEXT), `Écran de crash sur ${route}`).toHaveCount(0);
      await expect(page.locator("body"), `Page vide sur ${route}`).not.toBeEmpty();

      await joindreJournal(testInfo, route, j);
      expect(j.erreursPage, `Exception JS sur ${route} :\n${j.erreursPage.join("\n")}`).toEqual([]);
    });
  }
});
