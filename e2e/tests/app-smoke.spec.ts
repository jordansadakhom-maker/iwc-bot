import { test, expect } from "@playwright/test";
import { APP_ROUTES, ERROR_BOUNDARY_TEXT, collecteurErreurs, joindreJournal, nonConnecte } from "./_helpers";

// ── Smoke interne : chaque page de l'espace membre charge sans crash ──────────
// C'est le garde-fou principal contre la régression « This page couldn't load »
// (ChunkLoadError après déploiement) qui a touché la carte. Pour CHAQUE route :
//   1. pas d'exception JS non capturée (pageerror),
//   2. jamais l'error boundary interne,
//   3. le contenu de l'app est bien monté.
// Nécessite auth.json (voir README). Sans session → skip explicite.

test.describe("Espace interne — smoke de navigation", () => {
  for (const route of APP_ROUTES) {
    test(`${route} charge sans tomber sur l'error boundary`, async ({ page }, testInfo) => {
      const j = collecteurErreurs(page);

      const reponse = await page.goto(route, { waitUntil: "domcontentloaded" });

      // Session absente → on ne peut pas tester l'interne : skip franc.
      if (await nonConnecte(page)) {
        test.skip(true, "Pas de session (auth.json manquant ou expiré) — voir README.");
      }

      if (reponse) expect(reponse.status(), `HTTP ${reponse.status()} sur ${route}`).toBeLessThan(500);

      // Jamais l'écran de crash.
      await expect(page.getByText(ERROR_BOUNDARY_TEXT), `Error boundary déclenchée sur ${route}`).toHaveCount(0);

      // L'app a monté son contenu (la coquille rend un <main> ou une navigation).
      await expect(page.locator("main, [role=main], nav").first()).toBeVisible();

      await joindreJournal(testInfo, route, j);
      expect(j.erreursPage, `Exception JS sur ${route} :\n${j.erreursPage.join("\n")}`).toEqual([]);
    });
  }
});

// La carte interactive est la page la plus sensible (chunks lourds) : on lui
// laisse un instant de plus et on vérifie qu'elle ne bascule pas en erreur.
test("la carte interactive reste stable après montage", async ({ page }) => {
  await page.goto("/carte", { waitUntil: "domcontentloaded" });
  if (await nonConnecte(page)) test.skip(true, "Pas de session — voir README.");
  // Laisse les chunks/hydration se poser.
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.getByText(ERROR_BOUNDARY_TEXT)).toHaveCount(0);
});
