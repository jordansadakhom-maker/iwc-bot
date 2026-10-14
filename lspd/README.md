# Plateforme LSPD — serveur GTA V RP

Plateforme interne de gestion du **Los Santos Police Department** pour un serveur
**GTA V RP**. Projet **100 % roleplay / fiction** : aucune donnée réelle de joueur.

Construit sur la même pile éprouvée que le projet Red Dead, avec une identité et un
métier police entièrement différents. Il vit pour l'instant dans un dossier séparé
(`lspd/`) du dépôt actuel, sans toucher au projet Red Dead ; il sera déplacé dans son
propre dépôt plus tard.

## Pile technique

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS**
- **Supabase** (Postgres + RLS + Auth Discord + Storage) — projet **dédié**
- Permissions **par action**, vérifiées côté serveur (fail-closed)
- Journal d'**audit** non modifiable par les utilisateurs
- Hébergement visé **gratuit** : Vercel Hobby + Supabase (plan gratuit) + GitHub Actions

## État d'avancement (Phase 4 — socle)

Fait :
- Connexion **Discord** (OAuth via Supabase) + protection des routes (proxy).
- **Rôles & permissions** configurables (`lib/rbac.ts`) avec hiérarchie par défaut.
- **Journal d'audit** (`lib/audit.ts`).
- **Tableau de bord** branché sur les vraies données (agents, interventions, unités).
- Schéma de base : `sql/00-socle.sql` (grades, unités, agents, interventions, audit).

À venir : module **Agents & grades** (CRUD), puis **Dispatch & interventions**, puis les
modules suivants (rapports, personnes/véhicules, enquêtes, armurerie, flotte, recrutement,
administration), automatisations, intégrations Discord / FiveM.

## Installation

1. **Créer un projet Supabase dédié** (gratuit) → récupérer l'URL et les clés.
2. **Lancer le SQL** du socle : coller `sql/00-socle.sql` dans Supabase → SQL Editor → Run.
3. **Configurer Discord** comme fournisseur d'authentification dans Supabase
   (Authentication → Providers → Discord) avec l'URL de redirection `…/auth/callback`.
4. **Variables d'environnement** : copier `.env.example` en `.env.local` et renseigner.
5. Installer et lancer :

```bash
cd lspd
npm install
npm run dev     # http://localhost:3000
```

Premier lancement : le **premier compte connecté** reçoit un accès complet (amorçage)
pour se nommer et bâtir la hiérarchie ; l'amorçage se ferme dès qu'un agent existe.

## Déploiement

- **Vercel** (forfait Hobby gratuit) : Root Directory = `lspd`, renseigner les variables.
- Les tâches planifiées (rappels, statistiques) iront sur **GitHub Actions** (gratuit).

## Sécurité & cadre

- Secrets jamais exposés au navigateur (seule la clé publiable `anon` est publique).
- RLS activée sur toutes les tables ; écritures via la clé service_role côté serveur.
- Projet RP : rétention configurable, séparation stricte **admin technique** / **hiérarchie RP**,
  aucune capacité à prétendre connaître l'état « en jeu » sans connecteur FiveM réel.
