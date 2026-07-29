import { test, expect } from "@playwright/test";
import { PUBLIC_ROUTES, ERROR_BOUNDARY_TEXT, collecteurErreurs, joindreJournal } from "./_helpers";

// ── Pages publiques : chargent sans crash ────────────────────────────────────
// But : garantir qu'un visiteur (non connecté) accède à toutes les pages
// d'entrée sans exception JS et sans page blanche. Aucune donnée n'est créée.

for (const route of PUBLIC_ROUTES) {
  test(`page publique ${route} charge sans erreur`, async ({ page }, testInfo) => {
    const j = collecteurErreurs(page);

    const reponse = await page.goto(route, { waitUntil: "domcontentloaded" });
    // Le serveur ne doit pas renvoyer une 5xx.
    if (reponse) expect(reponse.status(), `HTTP ${reponse.status()} sur ${route}`).toBeLessThan(500);

    // La page a rendu quelque chose (le <body> n'est pas vide).
    await expect(page.locator("body")).not.toBeEmpty();

    // Jamais l'error boundary interne.
    await expect(page.getByText(ERROR_BOUNDARY_TEXT)).toHaveCount(0);

    await joindreJournal(testInfo, route, j);
    expect(j.erreursPage, `Exception JS sur ${route} :\n${j.erreursPage.join("\n")}`).toEqual([]);
  });
}

test("l'accueil affiche l'identité Iron Wolf", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Iron Wolf/i).first()).toBeVisible();
});

test("l'écran de connexion propose Discord", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await expect(page.getByText(/Discord/i).first()).toBeVisible();
});

test("la page rendez-vous public présente un formulaire", async ({ page }) => {
  await page.goto("/rendez-vous", { waitUntil: "domcontentloaded" });
  // Au moins un champ de saisie (formulaire de prise de rendez-vous).
  await expect(page.locator("input, textarea, select").first()).toBeVisible();
});
