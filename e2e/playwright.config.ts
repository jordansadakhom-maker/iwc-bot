import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// ── Config Playwright pour le site IWC en production ──────────────────────────
// - baseURL : par défaut la prod Vercel, surchargeable via IWC_BASE_URL.
// - Auth : capturée une fois dans auth.json (voir README) puis rejouée. Si le
//   fichier n'existe pas encore, les tests authentifiés se SKIP proprement au
//   lieu de planter.
// Rien ici ne touche à web/ — cette suite est volontairement hors du build.

const BASE_URL = process.env.IWC_BASE_URL || "https://iwc-bot-psi.vercel.app";
const AUTH_FILE = "auth.json";
const HAS_AUTH = existsSync(new URL(AUTH_FILE, import.meta.url));

export default defineConfig({
  testDir: "./tests",
  // La prod peut avoir une latence variable ; on laisse de la marge.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    // Traces & captures seulement quand un test échoue → post-mortem facile.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    // Échappatoire optionnelle : réutiliser un Chromium déjà présent au lieu de
    // celui géré par Playwright (utile en CI/conteneur). Laisser vide sinon.
    launchOptions: process.env.IWC_CHROMIUM_PATH ? { executablePath: process.env.IWC_CHROMIUM_PATH } : {},
  },

  projects: [
    // Pages PUBLIQUES — aucune auth requise.
    {
      name: "public",
      testMatch: /public\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Espace INTERNE — rejoue ta session (auth.json). Si absente → skip.
    {
      name: "app",
      testMatch: /(app-smoke|chasse-roundtrip)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: HAS_AUTH ? AUTH_FILE : undefined,
      },
    },
  ],
});
