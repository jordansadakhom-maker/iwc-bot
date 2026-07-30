import type { Page, TestInfo } from "@playwright/test";

// Texte affiché par l'error boundary interne (app/(app)/error.tsx) quand une page
// crashe au rendu — typiquement un ChunkLoadError après déploiement. Le smoke test
// vérifie que ce texte n'apparaît JAMAIS.
export const ERROR_BOUNDARY_TEXT = "Cette page n'a pas pu se charger";

// Pages PUBLIQUES (aucune connexion requise).
export const PUBLIC_ROUTES = ["/", "/login", "/rendez-vous", "/rejoindre", "/telegramme", "/suivi"];

// Espace INTERNE — toutes les routes de niveau 1 du groupe (app).
export const APP_ROUTES = [
  "/dashboard",
  "/activite",
  "/agenda",
  "/absences",
  "/operations",
  "/chasse",
  "/carte",
  "/carte-metier",
  "/armurerie",
  "/inventaire",
  "/mouvements",
  "/finances",
  "/membres",
  "/medical",
  "/communication",
  "/messages",
  "/notifications",
  "/journal",
  "/audit",
  "/repertoire",
  "/documents",
  "/licences",
  "/recrutement",
  "/demandes",
  "/renseignement",
  "/statistiques",
  "/taches",
  "/wanted",
  "/assistant",
  "/notes-vocales",
  "/direction",
];

// Dispensaire de Saint-Denis — toutes les pages de la section (espace distinct,
// avec son propre contrôle d'accès : une session non habilitée voit un écran
// « Accès réservé », ce qui n'est PAS un crash → le smoke passe quand même).
export const DISPENSAIRE_ROUTES = [
  "/dispensaire",
  "/dispensaire/assistant",
  "/dispensaire/cockpit",
  "/dispensaire/prises-en-charge",
  "/dispensaire/rendez-vous",
  "/dispensaire/interventions",
  "/dispensaire/chambres",
  "/dispensaire/ambulances",
  "/dispensaire/rh",
  "/dispensaire/pointage",
  "/dispensaire/salaires",
  "/dispensaire/stockage",
  "/dispensaire/coffres",
  "/dispensaire/matieres",
  "/dispensaire/fabrication",
  "/dispensaire/ventes",
  "/dispensaire/factures",
  "/dispensaire/comptabilite",
  "/dispensaire/fdo",
  "/dispensaire/frais",
  "/dispensaire/certificats",
  "/dispensaire/rapports",
  "/dispensaire/stats",
  "/dispensaire/historique",
  "/dispensaire/reglement",
  "/dispensaire/admin",
  "/dispensaire/audit",
  "/dispensaire/recherche",
  "/dispensaire/notifications",
];

// Bruit console tiers à ignorer (favicon, télémétrie, extensions…). On ne fait
// JAMAIS échouer un test sur ces motifs — seuls les vrais crashs comptent.
const IGNORER = [
  /favicon/i,
  /manifest/i,
  /net::ERR_/i,
  /Failed to load resource/i,
  /the server responded with a status of 4\d\d/i,
  /Download the React DevTools/i,
  /ResizeObserver loop/i,
  /\[Fast Refresh\]/i,
];

const estIgnore = (msg: string) => IGNORER.some((r) => r.test(msg));

export type Journal = {
  erreursPage: string[]; // exceptions JS non capturées (pageerror) → vrai crash
  erreursConsole: string[]; // console.error significatives (hors bruit tiers)
};

// Branche les collecteurs d'erreurs sur la page. À appeler AVANT toute navigation.
export function collecteurErreurs(page: Page): Journal {
  const j: Journal = { erreursPage: [], erreursConsole: [] };
  page.on("pageerror", (e) => {
    j.erreursPage.push(String(e?.message || e));
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (!estIgnore(t)) j.erreursConsole.push(t);
  });
  return j;
}

// Détecte une session non authentifiée : redirigé vers /login ou écran de
// connexion visible. Sert à skip proprement les tests internes sans auth.json.
export async function nonConnecte(page: Page): Promise<boolean> {
  if (page.url().includes("/login")) return true;
  const connexion = page.getByRole("heading", { name: "Connexion" });
  return (await connexion.count()) > 0;
}

// Attache le journal d'erreurs au rapport (utile en cas d'échec).
export async function joindreJournal(testInfo: TestInfo, route: string, j: Journal) {
  if (j.erreursPage.length || j.erreursConsole.length) {
    await testInfo.attach(`erreurs ${route}`, {
      body: JSON.stringify(j, null, 2),
      contentType: "application/json",
    });
  }
}
