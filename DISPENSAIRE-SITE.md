# Dispensaire de Saint-Denis — site autonome

Ce dépôt peut être déployé comme un **site 100 % dédié au Dispensaire de Saint-Denis**,
totalement indépendant d'Iron Wolf : sa propre adresse, sa propre base de données,
sa propre connexion. Aucune mention d'Iron Wolf n'apparaît.

Le « mode autonome » s'active avec **une seule variable** :
`NEXT_PUBLIC_DISPENSAIRE_STANDALONE=true`. Sans elle, le site reste le site
Iron Wolf normal — donc le déploiement Iron Wolf existant n'est pas affecté.

---

## Ce qu'il faut créer (comptes gratuits)

1. **Un projet Supabase dédié** (la base de données du dispensaire).
2. **Un compte Vercel** (l'hébergement du site).
3. **Une application Discord** (pour la connexion des membres).

---

## Étape 1 — Base de données (Supabase)

1. Crée un projet sur **supabase.com**.
2. Ouvre **SQL Editor** et exécute le fichier
   **`web/prisma/sql/dispensaire-COMPLET.sql`** (toutes les tables du dispensaire).
3. **Storage** → crée un bucket public nommé **`iwc`** (sert aux documents / photos).
   Autorise le type `application/pdf` dans ce bucket.
4. **Authentication → Providers → Discord** : active-le (on le configure à l'étape 2).
5. Note, dans **Project Settings → API** :
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` (secret) → `SUPABASE_SERVICE_ROLE_KEY`

## Étape 2 — Connexion Discord

1. **discord.com/developers** → New Application.
2. **OAuth2** → copie `Client ID` et `Client Secret` → colle-les dans
   Supabase (Authentication → Discord).
3. Dans Discord, **OAuth2 → Redirects**, ajoute l'URL de callback affichée par
   Supabase (`https://<projet>.supabase.co/auth/v1/callback`).

## Étape 3 — Hébergement (Vercel)

1. **vercel.com** → « Add New… → Project » → importe ce dépôt (ou un fork).
2. **Root Directory** : choisis **`web`**.
3. **Environment Variables** :

   | Variable | Valeur |
   |---|---|
   | `NEXT_PUBLIC_DISPENSAIRE_STANDALONE` | `true` |
   | `REQUIRE_AUTH` | `true` |
   | `NEXT_PUBLIC_SUPABASE_URL` | (Supabase) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (Supabase) |
   | `SUPABASE_SERVICE_ROLE_KEY` | (Supabase, secret) |
   | `ANTHROPIC_API_KEY` | *(optionnel — OCR / lecture d'images)* |

4. **Deploy** → tu obtiens une adresse en `…vercel.app`.

## Étape 4 — Finaliser la connexion

1. Ajoute la variable `NEXT_PUBLIC_APP_URL` = ton adresse `…vercel.app`, puis **Redeploy**.
2. Supabase → **Authentication → URL Configuration** : mets l'adresse Vercel en
   *Site URL* et dans les *Redirect URLs*.

## Étape 5 — Premier accès

1. Ouvre le site → **Connexion Discord**.
2. Tant qu'aucun membre n'est défini, l'accès est ouvert : va dans
   **Administration**, **ajoute-toi en Directeur**, puis affecte l'équipe
   (Directeur adjoint, RH, Médecin, Infirmier, Stagiaire).
3. Règle les seuils dans **Administration → Paramètres** si besoin
   (seuil de renvoi, prix du bandage, plafond hebdo…).

---

## Bon à savoir

- **Données à part** : cette base Supabase est distincte de tout autre projet —
  le dispensaire possède 100 % de ses données.
- **Répertoire** : l'onglet Répertoire (annuaire des entreprises) est masqué en
  mode autonome car il est encore rendu par la coquille Iron Wolf. Les tables
  `DispensaireContact` / `DispensaireCategorie` sont déjà prêtes dans le SQL si on
  décide de l'intégrer directement dans le site autonome plus tard.
- **Iron Wolf intact** : rien de tout ceci n'affecte le site Iron Wolf existant.
