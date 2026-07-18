# 🚀 Mettre le site en ligne — guide pas à pas

Tout le code est prêt. Il reste **6 étapes** à faire dans les tableaux de bord
(Discord, Supabase, Vercel). Compte ~20 min. Fais-les **dans l'ordre**.

> Repère utile : ton projet Supabase = `bmvsoymaxtfkhjfywiza`
> Son adresse de retour OAuth = `https://bmvsoymaxtfkhjfywiza.supabase.co/auth/v1/callback`

---

## 1) Créer l'application Discord (2 min)

1. Va sur https://discord.com/developers/applications → **New Application**.
2. Nomme-la « Iron Wolf Company » → **Create**.
3. Menu **OAuth2** (à gauche) :
   - Copie le **Client ID** et le **Client Secret** (clic sur *Reset Secret* si besoin). Garde-les de côté.
   - Dans **Redirects**, clique **Add Redirect** et colle exactement :
     ```
     https://bmvsoymaxtfkhjfywiza.supabase.co/auth/v1/callback
     ```
   - **Save Changes**.

## 2) Activer Discord dans Supabase (2 min)

1. Supabase → ton projet → **Authentication** → **Providers** → **Discord**.
2. Active-le, colle le **Client ID** et le **Client Secret** de l'étape 1.
3. **Save**.

## 3) Déployer le site sur Vercel (5 min)

1. Va sur https://vercel.com → connecte-toi **avec GitHub**.
2. **Add New… → Project** → importe le dépôt **iwc-bot**.
3. Réglages d'import :
   - **Root Directory** : clique *Edit* et choisis **`web`** ← important.
   - Framework : *Next.js* (détecté tout seul).
4. **Environment Variables** — ajoute ces trois lignes :
   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://bmvsoymaxtfkhjfywiza.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ta clé publiable `sb_publishable_...` |
   | `SUPABASE_SERVICE_ROLE_KEY` | ta clé secrète `sb_secret_...` (la même que sur le bot) |

   > La clé secrète sert aux lectures **côté serveur** uniquement — elle n'est
   > jamais envoyée au navigateur (pas de préfixe `NEXT_PUBLIC`). C'est ce qui
   > permet au tableau de bord d'afficher tes vraies données.
5. **Deploy**. À la fin, Vercel te donne une adresse type `https://iwc-xxxx.vercel.app` — **copie-la**.

## 4) Dire à Supabase quelle est l'adresse du site (2 min)

1. Supabase → **Authentication** → **URL Configuration**.
2. **Site URL** : colle ton adresse Vercel (`https://iwc-xxxx.vercel.app`).
3. **Redirect URLs** : ajoute ces deux lignes :
   ```
   https://iwc-xxxx.vercel.app/auth/callback
   https://iwc-xxxx.vercel.app/**
   ```
4. **Save**.

## 5) Tester la connexion (1 min)

1. Ouvre `https://iwc-xxxx.vercel.app/login`.
2. Clique **Se connecter avec Discord** → autorise.
3. Tu dois arriver sur le tableau de bord, avec ton nom en haut à droite. ✅

> Si ton compte Discord correspond à un membre (même identifiant), ton **nom RP
> et ton grade** s'affichent automatiquement.

## 6) Verrouiller l'accès (2 min) — À FAIRE EN DERNIER

Une fois que la connexion marche :

1. **Vercel** → ton projet → **Settings → Environment Variables** → ajoute :
   | Name | Value |
   |------|-------|
   | `REQUIRE_AUTH` | `true` |
   Puis **Redeploy** (onglet Deployments → … → Redeploy). Le site n'est
   désormais accessible qu'après connexion Discord.

> **Bonne nouvelle sécurité** : la protection RLS de ta base est **déjà active**.
> Personne ne peut lire tes données avec la clé publiable — le site les lit via
> la clé secrète, côté serveur uniquement. Tu n'as donc rien d'obligatoire à
> faire côté base.

### Optionnel — durcissement supplémentaire

- **Politiques de lecture par membre connecté** : si un jour tu veux que le site
  lise via la session de chaque membre (plutôt que la clé serveur), exécute
  [`prisma/sql/rls.sql`](./prisma/sql/rls.sql) dans Supabase → SQL Editor.
- **Changer le mot de passe de la base** : Supabase → Settings → Database →
  *Reset database password* (pense alors à le mettre à jour côté bot/Render).

---

## Et le bot dans tout ça ?

Le bot (sur Render) pousse déjà les vraies données vers Supabase toutes les
5 min — **dès que la branche est déployée sur `main`**. Le site, lui, lit
Supabase directement : il fonctionne indépendamment.

## Rappel sécurité

- La clé **publiable** (`sb_publishable_...`) peut être exposée côté site — c'est
  son rôle. Elle ne donne rien une fois la RLS activée (étape 6).
- La clé **secrète** (`sb_secret_...`) reste **uniquement sur le bot / Render**,
  jamais sur Vercel.
