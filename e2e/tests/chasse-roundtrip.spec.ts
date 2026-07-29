import { test, expect, type Page } from "@playwright/test";
import { ERROR_BOUNDARY_TEXT, collecteurErreurs, nonConnecte } from "./_helpers";

// ── Cycle réel créer → vérifier → supprimer (réversible, sûr) ─────────────────
// Exerce un vrai aller-retour d'écriture en base via l'UI native, sur une donnée
// de test clairement identifiée, puis la supprime. Aucune manipulation d'argent,
// aucune notification Discord (les actions Marchés écrivent seulement en base).
// Nécessite une session OFFICIER/Direction (le bouton « Ressource » n'apparaît
// que pour eux). Sans ce droit → skip explicite.

// Nom unique et trié en fin de liste → repérable et sans collision.
const NOM_TEST = `ZZZ Test QA ${Date.now()}`;

// Supprime la ressource de test si elle traîne encore (nettoyage idempotent).
async function nettoyer(page: Page, nom: string) {
  const ligne = page.locator("tr", { hasText: nom });
  if ((await ligne.count()) > 0) {
    await ligne
      .first()
      .getByTitle("Supprimer la ressource")
      .click()
      .catch(() => {});
    await expect(page.locator("tr", { hasText: nom })).toHaveCount(0).catch(() => {});
  }
}

test("Chasse · Marchés : créer puis supprimer une ressource de test", async ({ page }) => {
  const j = collecteurErreurs(page);

  await page.goto("/chasse", { waitUntil: "domcontentloaded" });
  if (await nonConnecte(page)) test.skip(true, "Pas de session — voir README.");

  // Onglet « Villes & Marchés ».
  await page.getByRole("button", { name: "Villes & Marchés" }).click();

  // Droit d'écriture requis : le bouton « Ressource » n'existe que pour un
  // officier / la Direction. Absent → on ne peut pas faire le cycle : skip.
  const boutonRessource = page.getByRole("button", { name: "Ressource" });
  if ((await boutonRessource.count()) === 0) {
    test.skip(true, "Session sans droit officier/Direction — pas de création possible.");
  }

  try {
    // 1) CRÉER
    await boutonRessource.click();
    const champ = page.getByPlaceholder("Nom de la ressource (ex : Cerf)");
    await expect(champ).toBeVisible();
    await champ.fill(NOM_TEST);
    await page.getByRole("button", { name: "Créer" }).click();

    // 2) VÉRIFIER — la ressource apparaît dans le tableau.
    await expect(page.locator("tr", { hasText: NOM_TEST })).toBeVisible({ timeout: 15_000 });

    // 3) SUPPRIMER — via le bouton corbeille de sa ligne.
    await page
      .locator("tr", { hasText: NOM_TEST })
      .getByTitle("Supprimer la ressource")
      .click();

    // 4) CONFIRMER la disparition.
    await expect(page.locator("tr", { hasText: NOM_TEST })).toHaveCount(0, { timeout: 15_000 });
  } finally {
    // Filet de sécurité : si une assertion a échoué au milieu, on nettoie.
    await nettoyer(page, NOM_TEST);
  }

  // Aucune erreur boundary ni exception JS pendant tout le cycle.
  await expect(page.getByText(ERROR_BOUNDARY_TEXT)).toHaveCount(0);
  expect(j.erreursPage, `Exception JS :\n${j.erreursPage.join("\n")}`).toEqual([]);
});
