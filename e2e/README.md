# Tests end-to-end IWC (Playwright)

Suite de tests **bout-en-bout** du site IWC, **jouée à la main avec ta session**.
Elle vit **hors de `web/`** : elle n'entre pas dans le build Vercel ni dans la CI
(`npm test` de `web/` ne regarde que `lib/**/*.test.ts`). Elle sert à **exercer
réellement l'interface** (navigation, formulaires, cycle créer → vérifier →
supprimer) contre la vraie prod, ce qu'aucun test unitaire ne peut faire.

## Ce qu'elle vérifie

| Fichier | Rôle |
|---|---|
| `tests/public.spec.ts` | Les pages **publiques** (`/`, `/login`, `/rendez-vous`, `/rejoindre`, `/telegramme`, `/suivi`) chargent sans exception JS, sans page blanche, sans 5xx. |
| `tests/app-smoke.spec.ts` | **Chaque page de l'espace membre** charge sans tomber sur l'écran « Cette page n'a pas pu se charger » (garde-fou contre le `ChunkLoadError` qui avait touché la carte). |
| `tests/chasse-roundtrip.spec.ts` | Cycle **réel et réversible** : crée une ressource `ZZZ Test QA …` dans Chasse › Villes & Marchés, vérifie qu'elle apparaît, puis la supprime. **Aucun argent, aucune notification Discord.** |

## Prérequis (une fois)

```bash
cd e2e
npm install
npx playwright install chromium
```

> Chromium est déjà présent sur beaucoup de machines ; la commande ci-dessus le
> récupère au besoin.

## 1) Capturer ta session (auth.json)

Les pages internes exigent d'être connecté (Discord OAuth). On enregistre **une
fois** ta session dans `auth.json` (ignoré par git — il contient tes cookies) :

```bash
npm run auth
```

Un navigateur s'ouvre sur `/login`. **Connecte-toi normalement avec Discord**,
attends d'atteindre le tableau de bord, puis **ferme la fenêtre** : Playwright
écrit `auth.json`. La session dure quelques jours ; si les tests internes se
mettent à se *skip* (« Pas de session »), relance simplement `npm run auth`.

Pour le cycle créer/supprimer de Chasse, connecte-toi avec un **compte officier
ou Direction** (sinon ce test se *skip* proprement, faute de droit d'écriture).

## 2) Lancer les tests

```bash
npm test            # toute la suite (public + interne)
npm run public      # seulement les pages publiques (aucune auth requise)
npm run smoke       # seulement le smoke de navigation interne
npm run roundtrip   # seulement le cycle créer → supprimer
npm run test:headed # avec navigateur visible (pour observer)
npm run test:ui     # mode interactif Playwright
```

Rapport HTML après coup :

```bash
npm run report
```

## Cibler un autre environnement

Par défaut, les tests visent la prod : `https://iwc-bot-psi.vercel.app`.
Pour tester un aperçu (preview) ou le local :

```bash
IWC_BASE_URL=https://ton-preview.vercel.app npm test
# ou, site lancé en local :
IWC_BASE_URL=http://localhost:3000 npm test
```

## Sûreté

- **Lecture seule** partout, **sauf** `chasse-roundtrip` qui crée **puis
  supprime** une ressource clairement nommée `ZZZ Test QA …`. Un `finally`
  nettoie même si une assertion échoue en cours de route.
- **Jamais** de mouvement d'argent, de contrat honoré, ni d'envoi Discord.
- `auth.json` (tes cookies) est **git-ignoré** — ne le commite jamais.
